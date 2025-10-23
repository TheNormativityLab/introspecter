# api/main.py - WebSocket Implementation with RabbitMQ
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from pydantic import ConfigDict, BaseModel, Field, model_validator
from typing import Optional, Dict, Any, Literal, List
from datetime import datetime
import uuid
import logging
import asyncio
import json, os, math
from functools import partial
from contextlib import asynccontextmanager
from pathlib import Path
from hydra import compose, initialize_config_dir
from omegaconf import OmegaConf, DictConfig
from celery.result import AsyncResult
import aio_pika
from aio_pika import Message, ExchangeType
from src.database.database import DatabaseManager
from src.database.repository import DebateRepository
from src.environments.debate.utils import load_and_prepare_data
from src.api.celery_app import celery_app
from src.api.websocket_manager import WebSocketManager
from fastapi import APIRouter, HTTPException, Depends
from src.environments.debate.utils import get_question_data
import litellm
litellm.disable_background_logging = True

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
db_manager: Optional[DatabaseManager] = None
ws_manager: Optional[WebSocketManager] = None
RABBITMQ_URL = os.getenv(
    'CELERY_BROKER_URL',
    'amqp://guest:guest@introspecter-rabbitmq:5672//'
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
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
        logger.info("WebSocket manager closed")
    
    if db_manager:
        await db_manager.close()
        logger.info("Database connection closed")


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
    """Request to create debate."""
    model_config = ConfigDict(
        populate_by_name=True, 
        extra='allow' 
    )
    
    debate_type: Literal["basic_debate", "consultancy", "judge"]
    task: Literal["mmlu", "math", "commonsense_qa", "gsm8k", "custom"]
    num_questions: int = Field(..., ge=1, le=1000)
    num_rounds: int = Field(2, ge=1, le=10)    
    
    agent_models: List[str] = Field(
        ..., 
        alias="agentModels",
        description="List of model config names to use for agents",
        min_length=1,
        max_length=3
    )
    
    human_agent_index: Optional[int] = Field(None, ge=0, alias="humanAgentIndex")
    seed: int = Field(0)
    name: Optional[str] = None
    summarize: bool = Field(True)    
    
    num_agents: Optional[int] = Field(None, deprecated=True, alias="numAgents")
    llm_conf_at_llm1: Optional[str] = Field(None, alias="llm_conf@llm1", deprecated=True)
    llm_conf_at_llm2: Optional[str] = Field(None, alias="llm_conf@llm2", deprecated=True)
    llm_conf_at_llm3: Optional[str] = Field(None, alias="llm_conf@llm3", deprecated=True)
    
    custom_questions: Optional[List[Dict[str, Any]]] = Field(
        None, 
        alias="customQuestions",
        description="custom questions"
    )
    
    selected_datasets: Optional[List[str]] = Field(
        default_factory=list,
        alias="selectedDatasets",
        description="Selected datasets for the debate"
    )
    
    @model_validator(mode='after')
    def validate_and_log_fields(self):
        """Validate agent models and log all important fields for debugging."""
        if not self.agent_models or len(self.agent_models) == 0:
            raise ValueError("At least 1 agent model is required. Please enable at least one agent.")
        
        if not self.selected_datasets:
            self.selected_datasets = []
            logger.warning("selected_datasets was empty, initialized to empty list")
        
        return self

class DebateResponse(BaseModel):
    """Response containing debate information."""
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
    """Request to replay a debate from a specific point."""
    original_debate_id: uuid.UUID
    question_index: int
    start_from_round: int = 0
    replace_agent_index: int
    question_data: Dict[str, Any]
    previous_rounds: List[Dict[str, Any]]
    original_config: Dict[str, Any]


class DebateListResponse(BaseModel):
    """Response containing list of debates."""
    debates: List[Dict[str, Any]]
    total: int

def load_hydra_config(
    name: str,
    task: str,
    seed: int,
    llm_conf: Optional[str] = None,
    num_questions: int = 1,
    num_rounds: int = 2,
    agent_counts: List[int] = None
) -> DictConfig:
    """Load Hydra configuration."""
    try:
        config_dir = str(Path(__file__).parent.parent / "conf")
        with initialize_config_dir(config_dir=config_dir, version_base="1.1"):
            overrides = [
                f"+task={task}",
                f"+experiment.num_questions={num_questions}",
                f"+experiment.num_rounds={num_rounds}",
                f"+experiment.name={name}",
                f"+cost_check={False}",
                f"++seed={seed}",
            ]

            if llm_conf:
                overrides.append(f"+llm_conf@llm1={llm_conf}")

            if agent_counts:
                overrides.append(f"+agent_counts=[{','.join(map(str, agent_counts))}]")

            cfg = compose(config_name="config", overrides=overrides)
            OmegaConf.resolve(cfg)
            return cfg

    except Exception as e:
        logger.error(f"Failed to load Hydra config: {e}", exc_info=True)
        raise HTTPException(500, detail=f"Failed to load configuration: {str(e)}")

async def get_db_session():
    """Get database session."""
    async with db_manager.get_session() as session:
        yield session


async def get_debate_repository(session=Depends(get_db_session)):
    """Get debate repository."""
    return DebateRepository(session)


@app.websocket("/ws/debates/{debate_id}")
async def websocket_debate(websocket: WebSocket, debate_id: uuid.UUID):
    """
    WebSocket endpoint for real-time debate communication.
    """
    await ws_manager.connect(websocket, str(debate_id))
    
    try:
        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            debate = await repo.get_debate(debate_id)
            if not debate:
                await websocket.send_json({
                    "type": "error",
                    "message": "Debate not found"
                })
                await websocket.close()
                return
        
        await websocket.send_json({
            "type": "connected",
            "debate_id": str(debate_id),
            "timestamp": datetime.utcnow().isoformat()
        })
        
        config = debate.config or {}
        if config.get('human_agent_index') is not None:
            logger.info(f"Sending human ready signal for debate {debate_id}")
            await ws_manager.send_human_ready_signal(str(debate_id))
            logger.info(f"Sent human ready signal for debate {debate_id}")
        
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
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for debate {debate_id}")
    except Exception as e:
        logger.error(f"WebSocket error for debate {debate_id}: {e}")
    finally:
        ws_manager.disconnect(str(debate_id))

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Debate System API",
        "version": "5.0.0",
        "status": "running",
        "features": ["celery", "rabbitmq", "websocket", "human-in-loop"]
    }


@app.post("/debates", response_model=DebateResponse, status_code=201)
async def create_debate(request: CreateDebateRequest):
    """Create and queue a new debate."""
    try:
        logger.info(f"Creating debate: type={request.debate_type}, task={request.task}")
        if not request.agent_models:
            raise HTTPException(
                400, 
                "At least 1 agent is required. agent_models field is missing or empty."
            )
        
        if len(request.agent_models) == 0:
            raise HTTPException(
                400, 
                "At least 1 agent is required. Please enable at least one agent."
            )
        
        logger.info(f"Agent models validated: {request.agent_models}")
        
        num_agents = len(request.agent_models)
        logger.info(f"Number of agents: {num_agents}")
        
        if request.human_agent_index is not None:
            if request.human_agent_index >= num_agents:
                raise HTTPException(400, f"human_agent_index must be < {num_agents}")
        
        llm_models = [m for m in request.agent_models if m.lower() not in ['human-participant', 'human', 'mock/human']]
        human_agent_indices = [i for i, m in enumerate(request.agent_models) if m.lower() in ['human-participant', 'human', 'mock/human']]
        
        if human_agent_indices:
            logger.info(f"Found human agents at indices: {human_agent_indices}")
            if request.human_agent_index is None:
                request.human_agent_index = human_agent_indices[0]
                logger.info(f"Setting human_agent_index to {request.human_agent_index}")
        
        from collections import Counter
        model_counts = Counter(llm_models)
        logger.info(f"LLM Model distribution (excluding humans): {dict(model_counts)}")
        unique_models = list(model_counts.keys())
        
        if len(unique_models) > 3:
            raise HTTPException(
                400, 
                "Currently only support up to 3 different LLM model types. "
                f"You requested {len(unique_models)}: {unique_models}"
            )
        
        llm1_config = unique_models[0] if unique_models else None
        llm1_count = model_counts[llm1_config] if llm1_config else 0
        
        llm2_config = None
        llm2_count = 0
        if len(unique_models) >= 2:
            llm2_config = unique_models[1]
            llm2_count = model_counts[llm2_config]
        
        llm3_config = None
        llm3_count = 0
        if len(unique_models) == 3:
            llm3_config = unique_models[2]
            llm3_count = model_counts[llm3_config]
        
        agent_counts = [llm1_count, llm2_count, llm3_count]
        
        logger.info(f"LLM1: {llm1_config} (count={llm1_count})")
        if llm2_config:
            logger.info(f"LLM2: {llm2_config} (count={llm2_count})")
        if llm3_config:
            logger.info(f"LLM3: {llm3_config} (count={llm3_count})")
        logger.info(f"Agent counts: {agent_counts}")
        
        actual_task = "custom" if request.custom_questions else request.task
        
        config_dir = str(Path(__file__).parent.parent / "conf")
        with initialize_config_dir(config_dir=config_dir, version_base="1.1"):
            overrides = [
                f"+task={actual_task}",
                f"+experiment.num_questions={request.num_questions}",
                f"+experiment.num_rounds={request.num_rounds}",
                f"+experiment.name={request.name or f'{request.debate_type}_{actual_task}'}",
                f"+cost_check={False}",
                f"++seed={request.seed}",
                f"+agent_counts=[{','.join(map(str, agent_counts))}]",
            ]
            
            if llm1_config:
                overrides.append(f"+llm_conf@llm1={llm1_config}")
            
            if llm2_config:
                overrides.append(f"+llm_conf@llm2={llm2_config}")
            
            if llm3_config:
                overrides.append(f"+llm_conf@llm3={llm3_config}")
            
            logger.info(f"Hydra overrides: {overrides}")
            
            hydra_cfg = compose(config_name="config", overrides=overrides)
            OmegaConf.resolve(hydra_cfg)
        
        all_questions = []
        num_custom = 0
        selected_datasets = (
            request.selected_datasets
            or getattr(request, "selectedDatasets", None)
            or []
        )

        logger.info(f"Selected datasets: {selected_datasets}")
        is_custom_run = "custom_questions" in selected_datasets
        other_datasets = [d for d in selected_datasets if d != "custom_questions"]

        if is_custom_run:
            if request.custom_questions:
                logger.info(f"Loading {len(request.custom_questions)} custom questions")
                for q in request.custom_questions:
                    question_text = str(q.get('question', ''))
                    answer = str(q.get('correctAnswer', q.get('answer', '')))
                    all_questions.append({
                        'question': question_text,
                        'answer': answer,
                        'question_prompt': question_text
                    })
                num_custom = len(all_questions)
                logger.info(f"Formatted {num_custom} custom questions")
            else:
                raise HTTPException(400, "custom_questions in selectedDatasets but no custom questions provided")
        else:
            if not other_datasets:
                other_datasets = [request.task]
                logger.info(f"No datasets selected, using task as dataset: {request.task}")
            
            if other_datasets:
                data_paths = {
                    "gsm8k": "data/GSM8k/gsm8k_test.jsonl",
                    "mmlu": "data/MMLU_test.json",
                    "math": "data/MATH_test.jsonl",
                    "commonsense_qa": "data/commonsense_qa_test.jsonl"
                }
                
                for dataset_name in other_datasets:
                    data_path = data_paths.get(dataset_name)
                    
                    if not data_path:
                        logger.warning(f"Unknown dataset: {dataset_name}, skipping")
                        continue
                    
                    if not Path(data_path).exists():
                        logger.warning(f"Data file not found: {data_path}, skipping")
                        continue
                    
                    logger.info(f"Loading {request.num_questions} questions from dataset: {dataset_name}")
                    dataset_questions = list(load_and_prepare_data(
                        task_name=dataset_name,
                        data_path=data_path,
                        num_questions=request.num_questions,
                        seed=request.seed,
                    ))
                    
                    logger.info(f"Loaded {len(dataset_questions)} questions from {dataset_name}")
                    all_questions.extend(dataset_questions)

        questions = all_questions[:request.num_questions]
        logger.info(f"Final question count: {len(questions)} (custom: {num_custom}, datasets: {len(questions) - num_custom})")

        if not questions:
            raise HTTPException(400, "No questions available. Provide custom_questions or select datasets.")

        is_custom_run = "custom_questions" in selected_datasets
        other_datasets = [d for d in selected_datasets if d != "custom_questions"]

        if is_custom_run:
            actual_task = "custom"
        elif other_datasets:
            actual_task = other_datasets[0]
        else:
            actual_task = request.task

        def get_domain_for_task(task_name: str) -> str:
            """Map task name to domain."""
            domain_mapping = {
                "custom": "custom",
                "gsm8k": "gsm8k",
                "math": "math",
                "mmlu": "mmlu",
                "commonsense_qa": "commonsense_qa",
            }
            domain = domain_mapping.get(task_name, "math")
            if task_name not in domain_mapping:
                logger.warning(f"Unknown task '{task_name}', defaulting domain to 'math'")
            return domain

        domain = get_domain_for_task(actual_task)
        logger.info(f"Task: {actual_task}, Domain: {domain}")
        llm_configs = {}
        
        if llm1_config:
            llm_configs["llm1"] = {"model": llm1_config, "count": llm1_count}
        if llm2_config:
            llm_configs["llm2"] = {"model": llm2_config, "count": llm2_count}
        if llm3_config:
            llm_configs["llm3"] = {"model": llm3_config, "count": llm3_count}
        
        if human_agent_indices:
            human_count = len(human_agent_indices)
            human_key = f"human_participants"
            llm_configs[human_key] = {
                "model": "human-participant",
                "count": human_count,
                "indices": human_agent_indices
            }
            logger.info(f"Added human participant config: {llm_configs[human_key]}")

        enhanced_metadata = {
            "task": actual_task,
            "domain": domain,
            "original_task": request.task,
            "has_custom_questions": bool(request.custom_questions),
            "num_custom_questions": num_custom,
            "selected_datasets": other_datasets,
            "num_dataset_questions": len(questions) - num_custom,
            "num_agents": num_agents,
            "num_rounds": request.num_rounds,
            "num_questions": len(questions),
            "seed": request.seed,
            "agent_models": request.agent_models, 
            "agent_distribution": dict(model_counts), 
            "unique_models": unique_models, 
            "llm_configs": llm_configs,  
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
                config={
                    **enhanced_metadata,
                },
                total_questions=len(questions)
            )
            debate_id = debate.id
            created_at = debate.created_at
        
        hydra_cfg_dict = OmegaConf.to_container(hydra_cfg, resolve=True)
        
        from src.api.tasks import run_debate_task
        formatted_questions = []
        for q in questions:
            if request.custom_questions:
                question_text = str(q.get('question', ''))
                answer = str(q.get('correctAnswer', q.get('answer', '')))
                
                formatted_questions.append({
                    'question': question_text,
                    'answer': answer,
                    'question_prompt': question_text
                })
            else:
                question_text, answer, question_prompt = get_question_data(q, request.task)
                formatted_questions.append({
                    'question': question_text,
                    'answer': answer,
                    'question_prompt': question_prompt
                })
                
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
        
        celery_task_id = task.id
        logger.info(f"Queued task {celery_task_id} for debate {debate_id}")        
        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            await repo.update_debate_task_id(debate_id, celery_task_id)
        
        return DebateResponse(
            debate_id=debate_id,
            debate_type=request.debate_type,
            status="queued",
            celery_task_id=celery_task_id,
            websocket_url=f"/ws/debates/{debate_id}",
            current_question_index=0,
            total_questions=len(questions),
            human_agent_index=request.human_agent_index,
            created_at=created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating debate: {e}", exc_info=True)
        raise HTTPException(500, detail=str(e))
    
@app.get("/debates/{debate_id}/status")
async def get_debate_status(
    debate_id: uuid.UUID,
):
    """Get current debate status with comprehensive error handling."""
    try:
        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            
            try:
                debate = await repo.get_debate(debate_id)
            except Exception as db_error:
                logger.error(f"Database error fetching debate {debate_id}: {db_error}")
                return {
                    "debate_id": str(debate_id),
                    "status": "unknown",
                    "current_question_index": 0,
                    "total_questions": 0,
                    "created_at": datetime.utcnow().isoformat(),
                    "error": "Database error",
                    "websocket_connected": False
                }
            
            if not debate:
                raise HTTPException(404, "Debate not found")
            
            response = {
                "debate_id": str(debate.id),
                "status": debate.status,
                "current_question_index": debate.completed_questions,
                "total_questions": debate.total_questions,
                "created_at": debate.created_at.isoformat(),
                "websocket_connected": ws_manager.is_connected(str(debate_id)) if ws_manager else False,
                "is_ready_for_websocket": debate.status in ["running", "queued", "pending"]  # Add this
            }
            
            if hasattr(debate, 'celery_task_id') and debate.celery_task_id:
                try:
                    task_result = AsyncResult(debate.celery_task_id, app=celery_app)
                    response["celery_task_id"] = debate.celery_task_id
                    response["task_status"] = {
                        "state": task_result.state,
                        "info": task_result.info if task_result.info else None
                    }
                except Exception as celery_error:
                    logger.warning(f"Could not fetch Celery status: {celery_error}")
                    response["task_status"] = {
                        "state": "UNKNOWN",
                        "info": None
                    }
            
            return response
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_debate_status: {e}", exc_info=True)
        return {
            "debate_id": str(debate_id),
            "status": "error",
            "error": str(e),
            "websocket_connected": False
        }

@app.get("/debates/{debate_id}/results")
async def get_debate_results(
    debate_id: uuid.UUID,
    repo: DebateRepository = Depends(get_debate_repository)
):
    """Get final debate results."""
    debate = await repo.get_debate(debate_id)
    if not debate:
        raise HTTPException(404, "Debate not found")
    
    question_sessions = await repo.get_question_sessions(debate_id)
    questions_data = []

    for session in question_sessions:
        question_result = {
            "question": session.question.question_text if session.question else None,
            "question_prompt": session.question.question_prompt if session.question else None,
            "question_id": session.question_id,
            "correct_answer": session.question.correct_answer if session.question else None,
            "debate_session": {"rounds": []},
        }

        rounds = await repo.get_rounds(session.id)
        for round_obj in rounds:
            round_result = {
                "round_number": round_obj.round_number,
                "responses": {},
            }

            responses = await repo.get_agent_responses(round_obj.id)
            
            for response in responses:
                unique_key = f"{response.model_name}_agent_{response.agent_index}"
                round_result["responses"][unique_key] = response.response_text
            
            question_result["debate_session"]["rounds"].append(round_result)

        questions_data.append(question_result)

    result = {
        "debate_id": str(debate_id),
        "wandb_metadata": getattr(debate, "wandb_metadata", {}),
        "performance_data": getattr(debate, "performance_data", {}),
        "questions": questions_data,
    }

    return result

@app.post("/debates/{debate_id}/cancel")
async def cancel_debate(
    debate_id: uuid.UUID,
    repo: DebateRepository = Depends(get_debate_repository)
):
    """Cancel a running debate."""
    debate = await repo.get_debate(debate_id)
    if not debate:
        raise HTTPException(404, "Debate not found")
        
    if hasattr(debate, 'celery_task_id') and debate.celery_task_id:        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            partial(
                celery_app.control.revoke,
                debate.celery_task_id,
                terminate=True
            )
        )
        
        await repo.update_debate_status(debate_id, "cancelled")
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        try:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                'debate_events',
                ExchangeType.TOPIC,
                durable=False
            )
            
            message_data = {
                "debate_id": str(debate_id),
                "type": "debate_cancelled",
                "timestamp": datetime.utcnow().isoformat(),
                "data": {}
            }
            
            message = Message(
                body=json.dumps(message_data).encode(),
                content_type='application/json'
            )
            
            await exchange.publish(
                message,
                routing_key=f'debate.events.{debate_id}'
            )
        finally:
            await connection.close()
        
        return {
            "debate_id": str(debate_id),
            "status": "cancelled"
        }
    
    raise HTTPException(400, "No active task found")

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    inspect = celery_app.control.inspect()
    active_workers = inspect.active()
    
    rabbitmq_status = "connected"
    try:
        if ws_manager and ws_manager.connection and not ws_manager.connection.is_closed:
            rabbitmq_status = "connected"
        else:
            rabbitmq_status = "disconnected"
    except:
        rabbitmq_status = "unknown"
    
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "connected" if db_manager else "disconnected",
        "celery_workers": len(active_workers) if active_workers else 0,
        "rabbitmq": rabbitmq_status,
        "active_websockets": ws_manager.get_connection_count() if ws_manager else 0
    }

@app.post("/debate/{debate_id}/human-response")
async def submit_human_response_endpoint(
    debate_id: str,
    response: HumanResponseRequest
):
    """
    Submit a human response to an ongoing debate via HTTP.
    This publishes directly to RabbitMQ where the Celery worker is listening.
    """
    logger.info(f"Received human response for debate {debate_id}")
    logger.info(f"Response text: {response.response_text[:100]}...")
    logger.info(f"Extracted answer: {response.extracted_answer}")
    
    try:
        try:
            debate_uuid = uuid.UUID(debate_id)
            logger.info(f"Parsed debate UUID: {debate_uuid}")
        except ValueError as e:
            logger.error(f"Invalid UUID format: {debate_id}")
            raise HTTPException(status_code=400, detail=f"Invalid debate ID format: {e}")
        
        debate = None
        try:
            async with db_manager.get_session() as session:
                repo = DebateRepository(session)
                debate = await repo.get_debate(debate_uuid)
                
                if debate:
                    logger.info(f"Found debate: {debate.id}, status: {debate.status}")
                else:
                    logger.warning(f"Debate not found in database: {debate_id}")
                    
                    all_debates = await repo.list_debates(limit=10)
                    logger.info(f"Recent debates in DB: {[str(d.id) for d in all_debates]}")
                    
                    raise HTTPException(status_code=404, detail="Debate not found")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Database error while fetching debate: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
        if debate.status not in ["running", "queued", "pending"]:
            logger.warning(f"Debate {debate_id} not active. Status: {debate.status}")
            raise HTTPException(
                status_code=400, 
                detail=f"Debate is not active (status: {debate.status})"
            )
        
        logger.info(f"Debate validation passed, publishing to RabbitMQ...")        
        try:
            await ws_manager.store_human_response(
                debate_id=debate_id,
                response_text=response.response_text,
                extracted_answer=response.extracted_answer
            )
            logger.info(f"Human response published to RabbitMQ for debate {debate_id}")
        except Exception as e:
            logger.error(f"Failed to publish to RabbitMQ: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to publish response: {str(e)}")
        
        return {
            "success": True,
            "message": "Human response submitted successfully",
            "debate_id": debate_id
        }
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(f"Unexpected error submitting human response: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit human response: {str(e)}"
        )

    
# @app.post("/debates/replay", response_model=DebateResponse, status_code=201)
# async def replay_debate(request: ReplayDebateRequest):
#     """
#     Create a replay of an existing debate from a specific round,
#     replacing one agent with human input.
#     """
#     try:
#         logger.info(f"Creating replay from debate {request.original_debate_id}")
#         logger.info(f"Starting from round {request.start_from_round}, replacing agent {request.replace_agent_index}")
        
#         # Verify original debate exists
#         async with db_manager.get_session() as session:
#             repo = DebateRepository(session)
#             original_debate = await repo.get_debate(request.original_debate_id)
#             if not original_debate:
#                 raise HTTPException(404, "Original debate not found")
            
#             if original_debate.status != "completed":
#                 raise HTTPException(400, "Can only replay completed debates")
        
#         # Extract config from original debate
#         config = request.original_config
#         task = config.get("task", "gsm8k")
#         num_agents = config.get("num_agents", 2)
#         total_rounds = config.get("num_rounds", 3)
#         seed = config.get("seed", 0)
#         llm_conf = config.get("llm_conf")
#         debate_type = original_debate.debate_type
        
#         # Calculate remaining rounds
#         remaining_rounds = total_rounds - request.start_from_round
#         if remaining_rounds <= 0:
#             raise HTTPException(400, "Cannot start from or after the last round")
        
#         # Build agent_counts for Hydra config
#         agent_counts = [num_agents, 0]
        
#         # Load Hydra config
#         hydra_cfg = load_hydra_config(
#             name=f"replay_{original_debate.name}",
#             task=task,
#             seed=seed,
#             llm_conf=llm_conf,
#             num_questions=1,  # Replaying single question
#             num_rounds=remaining_rounds,
#             agent_counts=agent_counts
#         )
        
#         # Create new debate for replay
#         async with db_manager.get_session() as session:
#             repo = DebateRepository(session)
#             debate = await repo.create_debate(
#                 name=f"Replay: {original_debate.name} (Q{request.question_index+1}, R{request.start_from_round})",
#                 debate_type=debate_type,
#                 config={
#                     **config,
#                     "is_replay": True,
#                     "original_debate_id": str(request.original_debate_id),
#                     "question_index": request.question_index,
#                     "start_from_round": request.start_from_round,
#                     "human_agent_index": request.replace_agent_index,
#                     "num_rounds": remaining_rounds,
#                 },
#                 total_questions=1
#             )
#             debate_id = debate.id
#             created_at = debate.created_at
        
#         # Convert config to dict for Celery
#         hydra_cfg_dict = OmegaConf.to_container(hydra_cfg, resolve=True)
        
#         # Prepare question data
#         questions = [{
#             "question": request.question_data.get("question_text"),
#             "answer": request.question_data.get("correct_answer"),
#             "question_prompt": request.question_data.get("question_prompt"),
#         }]
        
#         # Import replay task
#         from src.api.tasks import run_replay_task
        
#         # Queue Celery task
#         task = run_replay_task.apply_async(
#             kwargs={
#                 "debate_id": str(debate_id),
#                 "debate_type": debate_type,
#                 "hydra_cfg": hydra_cfg_dict,
#                 "question_data": request.question_data,
#                 "start_from_round": request.start_from_round,
#                 "previous_rounds": request.previous_rounds,
#                 "num_rounds": remaining_rounds,
#                 "num_agents": num_agents,
#                 "human_agent_index": request.replace_agent_index,
#                 "summarize": config.get("summarize", True),
#             },
#             task_id=f"replay-{debate_id}"
#         )
        
#         celery_task_id = task.id
#         logger.info(f"Queued replay task {celery_task_id} for debate {debate_id}")
        
#         # Store task ID
#         async with db_manager.get_session() as session:
#             repo = DebateRepository(session)
#             await repo.update_debate_task_id(debate_id, celery_task_id)
        
#         return DebateResponse(
#             debate_id=debate_id,
#             debate_type=debate_type,
#             status="queued",
#             celery_task_id=celery_task_id,
#             websocket_url=f"/ws/debates/{debate_id}",
#             current_question_index=0,
#             total_questions=1,
#             human_agent_index=request.replace_agent_index,
#             created_at=created_at
#         )
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error creating replay: {e}", exc_info=True)
#         raise HTTPException(500, detail=str(e))


# @app.get("/debates/{debate_id}/question/{question_index}")
# async def get_question_details(
#     debate_id: uuid.UUID,
#     question_index: int,
#     repo: DebateRepository = Depends(get_debate_repository)
# ):
#     """Get detailed information about a specific question in a debate."""
#     try:
#         debate = await repo.get_debate(debate_id)
#         if not debate:
#             raise HTTPException(404, "Debate not found")
        
#         question_sessions = await repo.get_question_sessions(debate_id)
        
#         if question_index >= len(question_sessions):
#             raise HTTPException(404, "Question index out of range")
        
#         session = question_sessions[question_index]
        
#         question_data = {
#             "question_id": session.question_id,
#             "question_text": session.question.question_text if session.question else None,
#             "question_prompt": session.question.question_prompt if session.question else None,
#             "correct_answer": session.question.correct_answer if session.question else None,
#             "rounds": [],
#         }
        
#         rounds = await repo.get_rounds(session.id)
#         for round_obj in rounds:
#             round_data = {
#                 "round_number": round_obj.round_number,
#                 "responses": {},
#             }
            
#             responses = await repo.get_agent_responses(round_obj.id)
#             for response in responses:
#                 round_data["responses"][response.model_name] = {
#                     "response_text": response.response_text,
#                     "extracted_answer": response.extracted_answer,
#                 }
            
#             question_data["rounds"].append(round_data)
        
#         return question_data
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error getting question details: {e}", exc_info=True)
#         raise HTTPException(500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)