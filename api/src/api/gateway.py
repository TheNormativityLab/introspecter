from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, APIRouter
from fastapi.responses import StreamingResponse
from pydantic import ConfigDict, BaseModel, Field, model_validator
from typing import Optional, Dict, Any, Literal, List, AsyncGenerator
from datetime import datetime
import uuid
import logging
import asyncio
import json
import os
import math
import re
from functools import partial
from contextlib import asynccontextmanager
from pathlib import Path
from collections import Counter
import aio_pika
from aio_pika import Message, ExchangeType
from hydra import compose, initialize_config_dir
from omegaconf import OmegaConf, DictConfig
from celery.result import AsyncResult
import litellm

from src.database.database import DatabaseManager
from src.database.repository import DebateRepository
from src.environments.debate.utils import load_and_prepare_data, get_question_data
from src.api.celery_app import celery_app
from src.api.websocket_manager import WebSocketManager, get_ws_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
db_manager: Optional[DatabaseManager] = None
ws_manager: Optional[WebSocketManager] = None
RABBITMQ_URL = os.getenv('CELERY_BROKER_URL', 'amqp://guest:guest@introspecter-rabbitmq:5672//')

CONFIG_MAP_CACHE = {
    "llama_3_1_8b": "llama_3_1_8B",
    "llama_3_1_8b_chat": "llama_3_1_8B",
    "llama_3_1_8b_instruct": "llama_3_1_8B",
    "vec_llama_3_1_8b": "llama_3_1_8B",
    "mistral_7b": "mistral_7B",
    "mistral_7b_instruct": "mistral_7B",
    "vec_mistral_7b": "mistral_7B",
    "gpt_3_5_turbo": "gpt_3_5_turbo",
    "gpt_4o_mini": "gpt_4o_mini",
    "human_participant": "human-participant",
    "human": "human-participant",
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_manager, ws_manager
    db_manager = DatabaseManager()
    await db_manager.create_tables()
    logger.info("Database initialized")
    
    ws_manager = WebSocketManager(rabbitmq_url=RABBITMQ_URL)
    await ws_manager.initialize()
    logger.info("WebSocket manager initialized")
    
    yield
    
    if ws_manager:
        await ws_manager.close()
    
    if db_manager:
        await db_manager.close()

app = FastAPI(
    title="Debate System API",
    description="Multi-agent debates with human-in-the-loop via WebSocket",
    version="5.0.0",
    lifespan=lifespan
)

class HumanResponseRequest(BaseModel):
    response_text: str
    extracted_answer: str

class CreateDebateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='allow')
    debate_type: Literal["basic_debate", "consultancy", "judge"]
    task: Literal["mmlu", "math", "commonsense_qa", "gsm8k", "custom"]
    num_questions: int = Field(..., ge=1, le=1000)
    num_rounds: int = Field(2, ge=1, le=10)
    agent_models: List[str] = Field(..., alias="agentModels", min_length=1, max_length=3)
    human_agent_index: Optional[int] = Field(None, ge=0, alias="humanAgentIndex")
    seed: int = Field(0)
    name: Optional[str] = None
    summarize: bool = Field(True)
    custom_questions: Optional[List[Dict[str, Any]]] = Field(None, alias="customQuestions")
    selected_datasets: Optional[List[str]] = Field(default_factory=list, alias="selectedDatasets")

    @model_validator(mode='after')
    def validate_fields(self):
        if not self.agent_models:
            raise ValueError("At least 1 agent model is required.")
        if not self.selected_datasets:
            self.selected_datasets = []
        return self

class CreateArgumentativeDebateRequest(BaseModel):
    type: str
    story: str
    question: str
    ai_claim: str
    human_claim: str
    model_name: str = "gpt-4o-mini"
    human_latest_argument: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None

class DebateResponse(BaseModel):
    debate_id: uuid.UUID
    debate_type: str
    status: str
    celery_task_id: str
    websocket_url: str
    current_question_index: int
    total_questions: int
    human_agent_index: Optional[int]
    created_at: datetime

class ReplayDebateRequest(BaseModel):
    original_debate_id: int
    start_from_round: int
    replace_agent_index: Optional[int] = None
    replace_agent_name: Optional[str] = None
    question_index: int
    question_data: Dict[str, Any]
    previous_rounds: Optional[List[Dict[str, Any]]] = []
    original_config: Dict[str, Any]
    
    def get_debate_id_str(self) -> str:
        return str(self.original_debate_id)

async def get_db_session():
    async with db_manager.get_session() as session:
        yield session

async def get_debate_repository(session=Depends(get_db_session)):
    return DebateRepository(session)

def normalize_model_name(model_name: str) -> str:
    if not model_name:
        return ""
    return model_name.lower().strip().replace("-", "_")

def get_model_config_name(model_name: str) -> str:
    if not model_name:
        return ""
    normalized = model_name.lower().strip().replace("-", "_").replace(".", "_")
    
    if normalized in CONFIG_MAP_CACHE:
        return CONFIG_MAP_CACHE[normalized]
    
    for key, value in CONFIG_MAP_CACHE.items():
        if normalized in key or key in normalized:
            return value
            
    return normalized

def _split_story_into_sentences(story: str) -> List[str]:
    """Helper to split story into sentences cleanly."""
    if not story:
        return []
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', story) if s.strip()]
    return sentences

def _format_story_with_indices(sentences: List[str]) -> str:
    """Format story as [1] Sentence one. [2] Sentence two."""
    formatted = []
    for i, sentence in enumerate(sentences):
        formatted.append(f"[{i+1}] {sentence}")
    return "\n".join(formatted)

def _extract_citations_from_response(response: str, sentences: List[str]) -> List[Dict[str, Any]]:
    """
    Parse the AI response for markers like [1], [2] and map them back to the original sentences.
    """
    citations = []
    seen_indices = set()    
    matches = re.findall(r'\[(\d+)\]', response)
    
    for idx_str in matches:
        try:
            idx = int(idx_str) - 1
            if 0 <= idx < len(sentences) and idx not in seen_indices:
                citations.append({
                    "text": sentences[idx],
                    "index": idx,
                    "sourceId": idx + 1
                })
                seen_indices.add(idx)
        except ValueError:
            continue
            
    return citations

async def _stream_argument_response(request: CreateArgumentativeDebateRequest) -> AsyncGenerator[str, None]:
    story_sentences = _split_story_into_sentences(request.story)
    formatted_story = _format_story_with_indices(story_sentences)
    
    base_context = (
        f"You are a debate AI participating in an argument.\n\n"
        f"STORY CONTEXT:\n{formatted_story}\n\n"
        f"Question: {request.question}\n"
        f"Your Claim (AI): {request.ai_claim}\n"
        f"Opponent Claim (Human): {request.human_claim}\n"
    )

    if request.human_latest_argument:
        instructions = (
            f"\nOPPONENT'S LATEST ARGUMENT:\n"
            f"\"{request.human_latest_argument}\"\n\n"
            "INSTRUCTIONS:\n"
            "1. You must write a direct REBUTTAL to the Opponent's Latest Argument above.\n"
            "2. Identify specific points in their argument that are contradicted or unsupported by the text.\n"
            "3. You MUST use DIRECT QUOTES from the story to support your counter-points.\n"
            "4. Enclose all direct quotes in double quotation marks.\n"
            "5. Immediately follow every quote with its citation number from the text, e.g., \"quoted text\" [3].\n"
            "6. Do not summarize; use the exact words from the numbered sentences provided.\n"
        )
    else:
        instructions = (
            "\nINSTRUCTIONS:\n"
            "1. Generate a persuasive opening argument supporting your claim based strictly on the story.\n"
            "2. You MUST use DIRECT QUOTES from the story to support your points.\n"
            "3. Enclose all direct quotes in double quotation marks.\n"
            "4. Immediately follow every quote with its citation number from the text, e.g., \"quoted text\" [3].\n"
            "5. Do not summarize; use the exact words from the numbered sentences provided.\n"
        )

    system_prompt = base_context + instructions    
    messages = [{"role": "system", "content": system_prompt}]
    
    full_response = ""
    
    try:
        response_iterator = await litellm.acompletion(
            model=request.model_name,
            messages=messages,
            stream=True,
            temperature=0.7 
        )
        
        async for chunk in response_iterator:
            content = chunk.choices[0].delta.content or ""
            if content:
                full_response += content
                yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
        
        citations = _extract_citations_from_response(full_response, story_sentences)
        
        yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        logger.error(f"Error streaming argument: {e}")
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

@app.post("/debates/argumentative-debate")
async def create_argumentative_debate(request: CreateArgumentativeDebateRequest):
    return StreamingResponse(
        _stream_argument_response(request),
        media_type="text/event-stream"
    )

@app.websocket("/ws/debates/{debate_id}")
async def websocket_debate(websocket: WebSocket, debate_id: uuid.UUID):
    await websocket.accept()
    try:
        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            debate = await repo.get_debate(debate_id)
            if not debate:
                await websocket.send_json({"type": "error", "message": "Debate not found"})
                await websocket.close()
                return

        config = debate.config or {}
        has_human = (
            config.get("human_agent_index") is not None
            or config.get("replace_agent_index") is not None
            or config.get("replace_agent_name") is not None
        )

        consumer_ready_event = asyncio.Event()
        await ws_manager.connect(websocket, str(debate_id), consumer_ready_event)
        await asyncio.wait_for(consumer_ready_event.wait(), timeout=10.0)

        await websocket.send_json({
            "type": "connected",
            "debate_id": str(debate_id),
            "timestamp": datetime.utcnow().isoformat(),
            "waiting_for_human": has_human
        })

        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "human_response":
                await ws_manager.store_human_response(
                    str(debate_id),
                    data.get("response_text"),
                    data.get("extracted_answer")
                )
                await websocket.send_json({
                    "type": "response_received",
                    "timestamp": datetime.utcnow().isoformat()
                })
            elif message_type == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat()
                })

    except asyncio.TimeoutError:
        await websocket.send_json({"type": "error", "message": "Consumer initialization timeout"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        ws_manager.disconnect(str(debate_id))

@app.post("/debates/{expId}/human-ready")
async def signal_human_ready(expId: str):
    try:
        ws_manager_inst = get_ws_manager()
        await ws_manager_inst.send_human_ready_signal(expId)
        return {"success": True, "message": "Ready signal sent"}
    except Exception as e:
        logger.error(f"Failed to send ready signal: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {
        "service": "Debate System API",
        "version": "5.0.0",
        "status": "running",
        "features": ["celery", "rabbitmq", "websocket", "human-in-loop"]
    }

def _prepare_hydra_config(request_data, agent_counts, llm_configs):
    actual_task = "custom" if request_data['custom_questions'] else request_data['task']
    config_dir = str(Path(__file__).parent.parent / "conf")
    
    with initialize_config_dir(config_dir=config_dir, version_base="1.1"):
        debate_type = request_data.get('debate_type', 'unknown')
        exp_name = request_data.get('name') or f"{debate_type}_{actual_task}"
        
        overrides = [
            f"+task={actual_task}",
            f"+experiment.num_questions={request_data['num_questions']}",
            f"+experiment.num_rounds={request_data['num_rounds']}",
            f"+experiment.name={exp_name}",
            f"+cost_check={False}",
            f"++seed={request_data['seed']}",
            f"+agent_counts=[{','.join(map(str, agent_counts))}]",
        ]
        
        for key, value in llm_configs.items():
            if value:
                overrides.append(f"+llm_conf@{key}={value}")
        
        hydra_cfg = compose(config_name="config", overrides=overrides)
        OmegaConf.resolve(hydra_cfg)
        return OmegaConf.to_container(hydra_cfg, resolve=True)

def _load_datasets(other_datasets, questions_per_dataset, seed):
    all_questions = []
    data_paths = {
        "gsm8k": "data/GSM8k/gsm8k_test.jsonl",
        "mmlu": "data/MMLU_test.json",
        "math": "data/MATH_test.jsonl",
        "commonsense_qa": "data/commonsense_qa.json"
    }
    
    for dataset_name in other_datasets:
        data_path = data_paths.get(dataset_name)
        if not data_path or not Path(data_path).exists():
            continue
            
        dataset_questions = list(load_and_prepare_data(
            task_name=dataset_name,
            data_path=data_path,
            num_questions=questions_per_dataset,
            seed=seed,
        ))
        all_questions.extend(dataset_questions)
    return all_questions

@app.post("/debates", response_model=DebateResponse, status_code=201)
async def create_debate(request: CreateDebateRequest):
    try:
        num_agents = len(request.agent_models)
        if request.human_agent_index is not None and request.human_agent_index >= num_agents:
            raise HTTPException(400, f"human_agent_index must be < {num_agents}")

        llm_models = [m for m in request.agent_models if m.lower() not in ['human-participant', 'human', 'mock/human']]
        human_agent_indices = [i for i, m in enumerate(request.agent_models) if m.lower() in ['human-participant', 'human', 'mock/human']]

        if human_agent_indices and request.human_agent_index is None:
            request.human_agent_index = human_agent_indices[0]

        mapped_models = [get_model_config_name(model) for model in llm_models]
        mapped_model_counts = Counter(mapped_models)
        unique_mapped_models = list(mapped_model_counts.keys())

        if len(unique_mapped_models) > 3:
            raise HTTPException(400, "Support max 3 different LLM types")

        llm_configs_map = {}
        agent_counts = [0, 0, 0]
        
        for i, model in enumerate(unique_mapped_models):
            if i < 3:
                llm_configs_map[f"llm{i+1}"] = model
                agent_counts[i] = mapped_model_counts[model]

        request_dict = request.model_dump()
        loop = asyncio.get_running_loop()
        
        hydra_cfg_dict = await loop.run_in_executor(
            None, 
            partial(_prepare_hydra_config, request_dict, agent_counts, llm_configs_map)
        )

        all_questions = []
        num_custom = 0
        is_custom_run = "custom_questions" in request.selected_datasets
        other_datasets = [d for d in request.selected_datasets if d != "custom_questions"]

        if is_custom_run and request.custom_questions:
            for q in request.custom_questions:
                q_text = str(q.get('question', ''))
                all_questions.append({
                    'question': q_text,
                    'answer': str(q.get('correctAnswer', q.get('answer', ''))),
                    'question_prompt': q_text
                })
            num_custom = len(all_questions)

        if not other_datasets and not is_custom_run:
            other_datasets = [request.task]

        if other_datasets:
            dataset_questions = await loop.run_in_executor(
                None,
                partial(_load_datasets, other_datasets, request.num_questions, request.seed)
            )
            all_questions.extend(dataset_questions)

        if not all_questions:
            raise HTTPException(400, "No questions available")

        actual_task = "custom" if is_custom_run else (other_datasets[0] if other_datasets else request.task)
        domain_map = {
            "custom": "custom", "gsm8k": "gsm8k", "math": "math", 
            "mmlu": "mmlu", "commonsense_qa": "commonsense_qa"
        }
        domain = domain_map.get(actual_task, "math")

        llm_config_meta = {f"llm{i+1}": {"model": m, "count": mapped_model_counts[m]} for i, m in enumerate(unique_mapped_models)}
        if human_agent_indices:
            llm_config_meta["human_participants"] = {
                "model": "human-participant",
                "count": len(human_agent_indices),
                "indices": human_agent_indices
            }

        enhanced_metadata = {
            "task": actual_task,
            "domain": domain,
            "original_task": request.task,
            "has_custom_questions": bool(request.custom_questions),
            "num_custom_questions": num_custom,
            "selected_datasets": other_datasets,
            "num_dataset_questions": len(all_questions) - num_custom,
            "num_agents": num_agents,
            "num_rounds": request.num_rounds,
            "num_questions": len(all_questions),
            "seed": request.seed,
            "agent_models": request.agent_models,
            "llm_configs": llm_config_meta,
            "agent_counts": agent_counts,
            "human_agent_index": request.human_agent_index,
            "human_agent_indices": human_agent_indices,
            "has_human_participant": bool(human_agent_indices),
            "debate_type": request.debate_type,
            "summarize": request.summarize,
        }

        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            debate = await repo.create_debate(
                name=request.name or f"{request.debate_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
                debate_type=request.debate_type,
                config=enhanced_metadata,
                total_questions=len(all_questions)
            )
            debate_id = debate.id
            created_at = debate.created_at

        from src.api.tasks import run_debate_task
        formatted_questions = []
        for q in all_questions:
            if isinstance(q, dict) and 'question_prompt' in q:
                formatted_questions.append(q)
            else:
                qt, ans, qp = get_question_data(q, request.task)
                formatted_questions.append({'question': qt, 'answer': ans, 'question_prompt': qp})

        task = run_debate_task.apply_async(
            kwargs={
                "debate_id": str(debate_id),
                "debate_type": request.debate_type,
                "hydra_cfg": hydra_cfg_dict,
                "questions": formatted_questions,
                "num_rounds": request.num_rounds,
                "num_agents": num_agents,
                "agent_models": request.agent_models,
                "human_agent_index": request.human_agent_index,
                "summarize": request.summarize,
                "enhanced_metadata": enhanced_metadata,
            },
            task_id=f"debate-{debate_id}"
        )

        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            await repo.update_debate_task_id(debate_id, task.id)

        return DebateResponse(
            debate_id=debate_id,
            debate_type=request.debate_type,
            status="queued",
            celery_task_id=task.id,
            websocket_url=f"/ws/debates/{debate_id}",
            current_question_index=0,
            total_questions=len(all_questions),
            human_agent_index=request.human_agent_index,
            created_at=created_at
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating debate: {e}", exc_info=True)
        raise HTTPException(500, detail=str(e))

@app.get("/debates/{debate_id}/status")
async def get_debate_status(debate_id: uuid.UUID):
    try:
        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            debate = await repo.get_debate(debate_id)
            
            if not debate:
                raise HTTPException(404, "Debate not found")
            
            response = {
                "debate_id": str(debate.id),
                "status": debate.status,
                "current_question_index": debate.completed_questions,
                "total_questions": debate.total_questions,
                "created_at": debate.created_at.isoformat(),
                "websocket_connected": ws_manager.is_connected(str(debate_id)) if ws_manager else False,
                "is_ready_for_websocket": debate.status in ["running", "queued", "pending"]
            }
            
            if debate.celery_task_id:
                try:
                    task_result = AsyncResult(debate.celery_task_id, app=celery_app)
                    response["celery_task_id"] = debate.celery_task_id
                    response["task_status"] = {"state": task_result.state, "info": task_result.info}
                except Exception:
                    response["task_status"] = {"state": "UNKNOWN", "info": None}
            
            return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status check error: {e}")
        return {"debate_id": str(debate_id), "status": "error", "error": str(e)}

@app.get("/debates/{debate_id}/results")
async def get_debate_results(debate_id: uuid.UUID, repo: DebateRepository = Depends(get_debate_repository)):
    debate = await repo.get_debate(debate_id)
    if not debate:
        raise HTTPException(404, "Debate not found")

    question_sessions = await repo.get_question_sessions(debate_id)
    questions_data = []

    for session in question_sessions:
        q_data = {
            "question": session.question.question_text if session.question else None,
            "question_prompt": session.question.question_prompt if session.question else None,
            "question_id": session.question_id,
            "correct_answer": session.question.correct_answer if session.question else None,
            "debate_session": {"rounds": []},
        }
        rounds = await repo.get_rounds(session.id)
        for r_obj in rounds:
            r_res = {"round_number": r_obj.round_number, "responses": {}}
            responses = await repo.get_agent_responses(r_obj.id)
            for resp in responses:
                key = f"{resp.model_name}_agent_{resp.agent_index}"
                r_res["responses"][key] = resp.response_text
            q_data["debate_session"]["rounds"].append(r_res)
        questions_data.append(q_data)

    return {
        "debate_id": str(debate_id),
        "wandb_metadata": getattr(debate, "wandb_metadata", {}),
        "performance_data": getattr(debate, "performance_data", {}),
        "questions": questions_data,
    }

@app.post("/debates/{debate_id}/cancel")
async def cancel_debate(debate_id: uuid.UUID, repo: DebateRepository = Depends(get_debate_repository)):
    debate = await repo.get_debate(debate_id)
    if not debate:
        raise HTTPException(404, "Debate not found")
        
    if debate.celery_task_id:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, partial(celery_app.control.revoke, debate.celery_task_id, terminate=True))
        
        await repo.update_debate_status(debate_id, "cancelled")
        
        message_data = json.dumps({
            "debate_id": str(debate_id),
            "type": "debate_cancelled",
            "timestamp": datetime.utcnow().isoformat(),
            "data": {}
        }).encode()

        try:
            if ws_manager and ws_manager.connection and not ws_manager.connection.is_closed:
                channel = await ws_manager.connection.channel()
                exchange = await channel.get_exchange("debate_events")
                await exchange.publish(
                    Message(body=message_data, content_type='application/json'),
                    routing_key=f'debate.events.{debate_id}'
                )
            else:
                connection = await aio_pika.connect_robust(RABBITMQ_URL)
                async with connection:
                    channel = await connection.channel()
                    exchange = await channel.declare_exchange('debate_events', ExchangeType.TOPIC)
                    await exchange.publish(
                        Message(body=message_data, content_type='application/json'),
                        routing_key=f'debate.events.{debate_id}'
                    )
        except Exception as e:
            logger.error(f"Failed to publish cancel event: {e}")
        
        return {"debate_id": str(debate_id), "status": "cancelled"}
    
    raise HTTPException(400, "No active task found")

@app.get("/health")
async def health_check():
    inspect = celery_app.control.inspect()
    active_workers = inspect.active() or {}
    
    try:
        rabbitmq_status = "connected" if ws_manager and ws_manager.connection and not ws_manager.connection.is_closed else "disconnected"
    except:
        rabbitmq_status = "unknown"
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "connected" if db_manager else "disconnected",
        "celery_workers": len(active_workers),
        "rabbitmq": rabbitmq_status,
        "active_websockets": ws_manager.get_connection_count() if ws_manager else 0
    }

@app.post("/debate/{debate_id}/human-response")
async def submit_human_response_endpoint(debate_id: str, response: HumanResponseRequest):
    try:
        try:
            d_uuid = uuid.UUID(debate_id)
        except ValueError:
            raise HTTPException(400, "Invalid debate ID format")

        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            debate = await repo.get_debate(d_uuid)
            if not debate:
                raise HTTPException(404, "Debate not found")
        
        if debate.status not in ["running", "queued", "pending"]:
            raise HTTPException(400, f"Debate is not active (status: {debate.status})")
        
        await ws_manager.store_human_response(
            debate_id=debate_id,
            response_text=response.response_text,
            extracted_answer=response.extracted_answer
        )
        return {"success": True, "message": "Human response submitted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting response: {e}")
        raise HTTPException(500, str(e))

@app.post("/debates/replay", response_model=DebateResponse, status_code=201)
async def replay_debate(request: ReplayDebateRequest):
    try:
        debate_id_input = request.get_debate_id_str()
        config = request.original_config
        total_rounds = config.get("num_rounds", 3)
        
        if request.start_from_round >= total_rounds:
            raise HTTPException(400, "Cannot start from or after the last round")

        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            debate = await repo.create_debate(
                name=f"Replay: {config.get('experiment_name', 'replay')} (Q{request.question_index+1}, R{request.start_from_round})",
                debate_type="basic_debate",
                config={
                    **config,
                    "question_index": request.question_index,
                    "is_replay": True,
                    "start_from_round": request.start_from_round,
                    "replace_agent_index": request.replace_agent_index,
                    "replace_agent_name": request.replace_agent_name,
                    "num_rounds": total_rounds,
                },
                total_questions=1
            )
            debate_id = debate.id
            created_at = debate.created_at

        questions = [{
            "question": request.question_data.get("question_text"),
            "answer": request.question_data.get("correct_answer"),
            "question_prompt": request.question_data.get("question_prompt"),
        }]

        from src.api.tasks import run_replay_task
        task = run_replay_task.apply_async(
            kwargs={
                "debate_id": str(debate_id),
                "debate_type": "basic_debate",
                "original_config": config,
                "questions": questions,
                "start_from_round": request.start_from_round,
                "previous_rounds": request.previous_rounds,
                "num_rounds": total_rounds,
                "experiment_name": config.get("experiment_name", "replay"),
                "replace_agent_index": request.replace_agent_index,
                "replace_agent_name": request.replace_agent_name,
                "summarize": config.get("summarize", True),
                "original_debate_id": request.get_debate_id_str(),
            },
            task_id=f"replay-{debate_id}"
        )

        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            await repo.update_debate_task_id(debate_id, task.id)

        return DebateResponse(
            debate_id=debate_id,
            debate_type="basic_debate",
            status="queued",
            celery_task_id=task.id,
            websocket_url=f"/ws/debates/{debate_id}",
            current_question_index=0,
            total_questions=1,
            human_agent_index=request.replace_agent_index,
            created_at=created_at
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating replay: {e}")
        raise HTTPException(500, str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)