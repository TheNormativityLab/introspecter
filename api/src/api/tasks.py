import asyncio
import logging
import time
import os
import uuid
import json
import aio_pika
import litellm
from typing import Dict, Any, Optional
from celery import Task
from datetime import datetime
from pathlib import Path
from hydra import compose, initialize_config_dir
from omegaconf import OmegaConf
from sqlalchemy import update

from src.api.celery_app import celery_app
from src.debates.basic_debate import BasicDebateOrchestrator
from src.database.database import DatabaseManager, Debate
from src.database.repository import DebateRepository

logger = logging.getLogger(__name__)
ACTIVE_ORCHESTRATORS: Dict[str, tuple[BasicDebateOrchestrator, float]] = {}
ORCHESTRATOR_TIMEOUT = 600
RABBITMQ_URL = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@localhost:5672/")

def cleanup_idle_orchestrators():
    current_time = time.time()
    to_remove = [
        did for did, (_, last_act) in ACTIVE_ORCHESTRATORS.items() 
        if current_time - last_act > ORCHESTRATOR_TIMEOUT
    ]
    for did in to_remove:
        ACTIVE_ORCHESTRATORS.pop(did, None)

def get_or_create_orchestrator(debate_id: str) -> BasicDebateOrchestrator:
    cleanup_idle_orchestrators()
    if debate_id in ACTIVE_ORCHESTRATORS:
        orch, _ = ACTIVE_ORCHESTRATORS[debate_id]
        ACTIVE_ORCHESTRATORS[debate_id] = (orch, time.time())
        return orch
    
    orch = BasicDebateOrchestrator()
    ACTIVE_ORCHESTRATORS[debate_id] = (orch, time.time())
    return orch

def update_orchestrator_activity(debate_id: str):
    if debate_id in ACTIVE_ORCHESTRATORS:
        orch, _ = ACTIVE_ORCHESTRATORS[debate_id]
        ACTIVE_ORCHESTRATORS[debate_id] = (orch, time.time())

def remove_orchestrator(debate_id: str):
    ACTIVE_ORCHESTRATORS.pop(debate_id, None)

@celery_app.task(name="src.api.tasks.run_debate_task", bind=True, track_started=True)
def run_debate_task(self, debate_id: str, debate_type: str = "basic_debate", hydra_cfg: dict = None, questions: list = None, num_rounds: int = 3, num_agents: int = 2, agent_models: list = None, human_agent_index: int = None, enhanced_metadata: dict = None, **kwargs):
    config_dict = hydra_cfg or {}
    config_dict.update({
        'questions': questions or [],
        'num_rounds': num_rounds,
        'num_agents': num_agents,
        'agent_models': agent_models,
        'human_agent_index': human_agent_index,
        'debate_type': debate_type,
        'enhanced_metadata': enhanced_metadata
    })

    try:
        return asyncio.run(_run_debate_async(debate_id, config_dict))
    except Exception:
        remove_orchestrator(debate_id)
        raise

@celery_app.task(name="src.api.tasks.run_replay_task", bind=True, track_started=True)
def run_replay_task(self, debate_id: str, debate_type: str = "basic_debate", original_config: dict = None, questions: list = None, num_rounds: int = 3, experiment_name: str = "replay_debate", previous_rounds: list = None, start_from_round: int = 0, replace_agent_index: int = None, replace_agent_name: str = None, enhanced_metadata: dict = None, **kwargs):
    try:
        return asyncio.run(_run_replay_async(
            debate_id=debate_id,
            original_config=original_config,
            questions=questions,
            num_rounds=num_rounds,
            experiment_name=experiment_name,
            previous_rounds=previous_rounds,
            start_from_round=start_from_round,
            replace_agent_index=replace_agent_index,
            replace_agent_name=replace_agent_name,
            enhanced_metadata=enhanced_metadata,
            **kwargs
        ))
    except Exception:
        remove_orchestrator(debate_id)
        raise

async def _run_replay_async(debate_id: str, original_config: dict, questions: list, num_rounds: int, experiment_name: str, previous_rounds: list, start_from_round: int, replace_agent_index: int, replace_agent_name: str, enhanced_metadata: dict = None, **kwargs) -> dict:
    human_agent_index = replace_agent_index
    _validate_replay_config(original_config, start_from_round)
    
    orchestrator = get_or_create_orchestrator(debate_id)
    
    try:
        llm_configs_from_original = original_config.get("llm_conf", [])
        agent_counts_dict = original_config.get("agent_counts", {})
        aggregated_counts = {}
        for key, count in agent_counts_dict.items():
            base = key.rsplit('_agent_', 1)[0] if '_agent_' in key else key
            aggregated_counts[base] = aggregated_counts.get(base, 0) + count
            
        agent_models = []
        for llm_config in llm_configs_from_original:
            m_name = llm_config.get("modelName") or llm_config.get("model")
            if m_name not in aggregated_counts:
                continue
            c_name = get_config_name_from_model(llm_config)
            count = aggregated_counts[m_name]
            agent_models.extend([c_name] * count)
            
        if human_agent_index is None and replace_agent_name:
            if '_agent_' in replace_agent_name:
                base, num_str = replace_agent_name.rsplit('_agent_', 1)
                num = int(num_str)
                matching = next((k.rsplit('_agent_', 1)[0] for k in agent_counts_dict if k.startswith(base)), None)
                if matching:
                    target_conf = next((get_config_name_from_model(c) for c in llm_configs_from_original if (c.get("modelName") or c.get("model")) == matching), None)
                    if target_conf:
                        occ = 0
                        for idx, m in enumerate(agent_models):
                            if m == target_conf:
                                if occ == num:
                                    human_agent_index = idx
                                    break
                                occ += 1
            else:
                human_agent_index = _find_agent_index_by_name(agent_models, replace_agent_name)

        if human_agent_index is not None:
            agent_models[human_agent_index] = "human-participant"
            
        hydra_cfg = _build_hydra_config_for_replay_simple(original_config, agent_models, num_rounds, experiment_name)
        if llm_configs_from_original:
            hydra_cfg['llm_conf'] = llm_configs_from_original

        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            
            human_response_exchange = await channel.declare_exchange('human_responses', aio_pika.ExchangeType.DIRECT, durable=True)
            human_response_queue = await channel.declare_queue(f'human_response_{debate_id}', durable=True, auto_delete=False)
            await human_response_queue.bind(human_response_exchange, routing_key=debate_id)
            
            human_ready_queue = await channel.declare_queue(f'human_ready_{debate_id}', durable=True, auto_delete=False)
            await human_ready_queue.bind(human_response_exchange, routing_key=f"{debate_id}_ready")
            
            try:
                if orchestrator.status == "initialized":
                    await orchestrator.initialize_from_hydra(
                        debate_id=uuid.UUID(debate_id),
                        hydra_cfg=hydra_cfg,
                        questions=questions,
                        num_rounds=num_rounds,
                        num_agents=len(agent_models),
                        agent_models=agent_models,
                        summarize=original_config.get("summarize", True)
                    )
                    if enhanced_metadata:
                        await store_wandb_metadata(debate_id, enhanced_metadata, hydra_cfg)

                await _broadcast_debate_event(debate_id, "waiting_for_human_connection", {"message": "Please connect to continue"})

                try:
                    async with human_ready_queue.iterator() as queue_iter:
                        async for message in queue_iter:
                            async with message.process():
                                break
                except Exception:
                    return None

                for question_idx, q_data in enumerate(questions):
                    q_text = q_data.get("question", "")
                    q_prompt = q_data.get("question_prompt")
                    ans = q_data.get("answer", "")
                    
                    q_session = await _create_question_and_session(debate_id, q_data, num_rounds, is_replay=True)
                    orchestrator.current_question_session_id = q_session.id
                    
                    for agent in orchestrator.agents:
                        if hasattr(agent, 'set_instruction'):
                            agent.set_instruction(q_text)

                    replayed_responses = {}
                    if previous_rounds and start_from_round >= 0:
                        for idx in range(start_from_round):
                            if idx < len(previous_rounds):
                                p_resps = previous_rounds[idx].get('responses', {})
                                for a_idx, agent in enumerate(orchestrator.agents):
                                    resp = None
                                    if a_idx == human_agent_index and replace_agent_name in p_resps:
                                        resp = p_resps[replace_agent_name]
                                    else:
                                        base = agent.name.split('_agent_')[0]
                                        num = int(agent.name.split('_agent_')[1]) if '_agent_' in agent.name else 0
                                        norm = normalize_model_name(base)
                                        for orig in p_resps:
                                            o_base = orig.split('_agent_')[0]
                                            o_num = int(orig.split('_agent_')[1]) if '_agent_' in orig else 0
                                            if normalize_model_name(o_base) == norm and o_num == num:
                                                resp = p_resps[orig]
                                                break
                                    if resp and hasattr(agent, 'answer_history'):
                                        agent.answer_history.append(resp)

                    for round_num in range(start_from_round, num_rounds):
                        update_orchestrator_activity(debate_id)
                        all_prev = {}
                        for p_idx in range(round_num):
                            rk = f"round_{p_idx}"
                            if p_idx < start_from_round and previous_rounds:
                                all_prev[rk] = previous_rounds[p_idx].get('responses', {})
                            elif p_idx >= start_from_round and p_idx in replayed_responses:
                                all_prev[rk] = replayed_responses[p_idx]

                        round_res = await orchestrator._run_debate_round(
                            question=q_text,
                            question_prompt=q_prompt,
                            round_number=round_num,
                            skip_agent_index=human_agent_index
                        )

                        curr_resps = round_res.responses.copy()
                        await _broadcast_debate_event(debate_id, "waiting_for_human", {
                            "question_index": question_idx,
                            "round_number": round_num,
                            "question_text": q_text,
                            "previous_rounds": all_prev,
                            "current_round_responses": curr_resps,
                            "replace_agent_name": replace_agent_name,
                        })

                        human_resp_text = None
                        human_ans_ext = None
                        
                        try:
                            async with human_response_queue.iterator() as q_iter:
                                async for message in q_iter:
                                    async with message.process():
                                        data = json.loads(message.body.decode())
                                        human_resp_text = data['response_text']
                                        human_ans_ext = data.get('extracted_answer')
                                        break
                        except Exception:
                            raise TimeoutError("Failed to get human response")
                        
                        update_orchestrator_activity(debate_id)
                        
                        if orchestrator.human_agent_name:
                            round_res.add_response(orchestrator.human_agent_name, human_resp_text)
                            h_agent = orchestrator.agents[human_agent_index]
                            if hasattr(h_agent, 'answer_history'):
                                h_agent.answer_history.append(human_resp_text)

                        replayed_responses[round_num] = round_res.responses.copy()
                        
                        await _broadcast_debate_event(debate_id, "round_replayed", {
                            "question_index": question_idx,
                            "round_number": round_num,
                            "responses": round_res.responses
                        })
                        
                        await orchestrator._store_round(
                            round_data=round_res,
                            correct_answer=ans,
                            human_agent_index=human_agent_index,
                            human_extracted_answer=human_ans_ext
                        )

                    await orchestrator._complete_question_session()
                await orchestrator._complete_debate()
                
                await _broadcast_debate_event(debate_id, "debate_completed", {"debate_id": debate_id, "questions_processed": len(questions)})
                remove_orchestrator(debate_id)
                
                return {"status": "replay_completed", "debate_id": debate_id}

            finally:
                try:
                    if human_response_queue: await human_response_queue.delete(if_unused=False, if_empty=False)
                    if human_ready_queue: await human_ready_queue.delete(if_unused=False, if_empty=False)
                except Exception as e:
                    logger.error(f"Error cleaning up queues: {e}")

    except Exception as e:
        await _broadcast_debate_event(debate_id, "debate_error", {"error": str(e)})
        remove_orchestrator(debate_id)
        raise

def _build_hydra_config_for_replay_simple(original_config, agent_models, num_rounds, experiment_name):
    task = original_config.get("task", "gsm8k")
    seed = original_config.get("seed", 0)
    unique = list(set([m for m in agent_models if normalize_model_name(m) != 'human-participant']))
    
    overrides = [
        f"+task={task}",
        f"+experiment.num_questions=1",
        f"+experiment.num_rounds={num_rounds}",
        f"+experiment.name=replay_{experiment_name}",
        f"+cost_check={False}",
        f"++seed={seed}",
    ]
    
    for idx, m in enumerate(unique[:3]):
        overrides.append(f"+llm_conf@llm{idx+1}={api_format_to_config_name(m)}")
    
    config_dir = str(Path(__file__).parent.parent / "conf")
    with initialize_config_dir(config_dir=config_dir, version_base="1.1"):
        hydra_cfg = compose(config_name="config", overrides=overrides)
        OmegaConf.resolve(hydra_cfg)
    return OmegaConf.to_container(hydra_cfg, resolve=True)

def normalize_model_name(name: str) -> str:
    norm = name.lower().replace('_', '-').replace('/', '-').replace('.', '-')
    for p in ['vec-', 'together-']:
        if norm.startswith(p): norm = norm[len(p):]
    for s in ['-chat', '-instruct', '-turbo']:
        if norm.endswith(s): norm = norm[:-len(s)]
    return norm.strip('-')

def get_config_name_from_model(model_config: dict) -> str:
    name = (model_config.get("modelName") or model_config.get("model", "")).lower().replace("-", "_").replace(".", "_")
    if "human" in name: return "human-participant"
    if "llama" in name and "3" in name and "8b" in name: return "vec_llama_3_1_8B" if "vec" in name else "llama_3_1_8B"
    if "mistral" in name and "7b" in name: return "vec_mistral_7B" if "vec" in name else "mistral_7B"
    if "gpt_4o_mini" in name: return "gpt_4o_mini"
    if "gpt_3_5_turbo" in name: return "gpt_3_5_turbo"
    return name

def api_format_to_config_name(name: str) -> str:
    if not name or name == 'human-participant': return name
    return name.replace('-', '_').replace('.', '_')

def _find_agent_index_by_name(agent_models: list, agent_name: str) -> int:
    target = normalize_model_name(agent_name)
    for i, m in enumerate(agent_models):
        if normalize_model_name(m) == target: return i
    return None

def _validate_replay_config(cfg: dict, start_round: int):
    if not cfg: raise ValueError("Config empty")
    if start_round >= cfg.get("num_rounds", 0): raise ValueError("Start round >= num rounds")

async def _run_debate_async(debate_id: str, config_dict: dict) -> Dict[str, Any]:
    orchestrator = get_or_create_orchestrator(debate_id)
    questions = config_dict.get('questions', [])
    agent_models = config_dict.get('agent_models', [])
    human_idx = config_dict.get('human_agent_index')
    
    if human_idx is None and agent_models:
        for i, m in enumerate(agent_models):
            if m.lower() in ['human-participant', 'human', 'mock/human']:
                human_idx = i
                break

    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    
    async with connection:
        channel = await connection.channel()
        h_resp_q = None
        h_ready_q = None

        try:
            if human_idx is not None:
                exc = await channel.declare_exchange('human_responses', aio_pika.ExchangeType.DIRECT, durable=True)
                h_resp_q = await channel.declare_queue(f'human_response_{debate_id}', durable=True, auto_delete=False)
                await h_resp_q.bind(exc, routing_key=debate_id)
                h_ready_q = await channel.declare_queue(f'human_ready_{debate_id}', durable=True, auto_delete=False)
                await h_ready_q.bind(exc, routing_key=f"{debate_id}_ready")
                
                await _broadcast_debate_event(debate_id, "waiting_for_human_connection", {"message": "Connect"})
                
                try:
                    async with h_ready_q.iterator() as iter:
                        async for msg in iter:
                            async with msg.process(): break
                except Exception:
                    raise Exception("Human connect timeout")
            
            if orchestrator.status == "initialized":
                await orchestrator.initialize_from_hydra(
                    debate_id=uuid.UUID(debate_id),
                    hydra_cfg=config_dict,
                    questions=questions,
                    num_rounds=config_dict.get('num_rounds', 3),
                    num_agents=config_dict.get('num_agents', 1),
                    agent_models=agent_models,
                    summarize=config_dict.get('summarize', True)
                )
                if config_dict.get('enhanced_metadata'):
                    await store_wandb_metadata(debate_id, config_dict['enhanced_metadata'], config_dict)
                
                await _broadcast_debate_event(debate_id, "debate_started", {
                    "debate_id": debate_id, "num_questions": len(questions)
                })

            for q_idx, q_data in enumerate(questions):
                q_text = str(q_data.get('question', ''))
                ans = str(q_data.get('answer', ''))
                q_sess = await _create_question_and_session(debate_id, q_data, config_dict.get('num_rounds', 3))
                orchestrator.current_question_session_id = q_sess.id
                
                await _broadcast_debate_event(debate_id, "question_started", {"question_index": q_idx, "question_text": q_text})
                
                for agent in orchestrator.agents:
                    await agent.reset()
                    agent.set_instruction(q_data.get('question_prompt') or q_text)
                
                for r_num in range(config_dict.get('num_rounds', 3)):
                    update_orchestrator_activity(debate_id)
                    await _broadcast_debate_event(debate_id, "round_started", {"round_number": r_num})
                    
                    # Initialize variables to prevent UnboundLocalError
                    res = None
                    h_resp, h_ext = None, None

                    all_previous_rounds = {}
                    for past_r_idx in range(r_num):
                        round_key = f"round_{past_r_idx}"
                        round_data = {}
                        for agent in orchestrator.agents:
                            if hasattr(agent, 'answer_history') and len(agent.answer_history) > past_r_idx:
                                round_data[agent.name] = agent.answer_history[past_r_idx]
                        all_previous_rounds[round_key] = round_data

                    if human_idx is not None:
                        await _broadcast_debate_event(debate_id, "waiting_for_human", {
                            "question_index": q_idx,
                            "round_number": r_num,
                            "question_text": q_text,
                            "previous_rounds": all_previous_rounds,
                            "current_round_index": r_num 
                        })
                        
                        try:
                            async with h_resp_q.iterator() as iter:
                                async for msg in iter:
                                    async with msg.process():
                                        data = json.loads(msg.body.decode())
                                        h_resp = data['response_text']
                                        h_ext = data.get('extracted_answer')
                                        orchestrator.agents[human_idx].answer_history.append(h_resp)
                                        break
                        except Exception:
                            raise TimeoutError("Human response timeout")
                        
                        res = await orchestrator._run_debate_round(q_text, None, r_num, human_idx)
                        await _broadcast_debate_event(debate_id, "ai_responses_ready", {
                            "round_number": r_num, 
                            "ai_responses": {
                                k: v for k, v in res.responses.items() 
                                if k != orchestrator.human_agent_name
                            }
                        })
                        res.add_response(orchestrator.human_agent_name, h_resp)
                    else:
                        res = await orchestrator._run_debate_round(q_text, None, r_num)
                        h_resp, h_ext = None, None

                    if res is not None:
                        await orchestrator._store_round(res, ans, human_idx, h_ext)
                        await _broadcast_debate_event(debate_id, "round_completed", {"round_number": r_num, "responses": res.responses})
                
                await orchestrator._complete_question_session()
                await _broadcast_debate_event(debate_id, "question_completed", {"question_index": q_idx})
            
            await orchestrator._complete_debate()
            await _broadcast_debate_event(debate_id, "debate_completed", {"debate_id": debate_id})
            remove_orchestrator(debate_id)
            return {"status": "completed", "debate_id": debate_id}

        except Exception as e:
            await _broadcast_debate_event(debate_id, "debate_error", {"error": str(e)})
            remove_orchestrator(debate_id)
            raise
        finally:
            try:
                if h_resp_q: await h_resp_q.delete(if_unused=False, if_empty=False)
                if h_ready_q: await h_ready_q.delete(if_unused=False, if_empty=False)
            except Exception as e:
                logger.error(f"Error deleting queues: {e}")

async def _create_question_and_session(debate_id, q_data, num_rounds, is_replay=False):
    import hashlib
    q_text = str(q_data.get('question', ''))
    ans = str(q_data.get('answer', ''))
    suffix = f"_replay_{time.time()}" if is_replay else ""
    qid = int(hashlib.sha256(f"{debate_id}_{q_text}_{ans}{suffix}".encode()).hexdigest()[:8], 16) % 2147483647
    
    db = DatabaseManager()
    async with db.get_session() as s:
        r = DebateRepository(s)
        q = await r.get_or_create_question(qid, q_text, ans, q_data.get('question_prompt'))
        await s.commit()
        qs = await r.create_question_session(uuid.UUID(debate_id), q.id, num_rounds)
        await s.commit()
        return qs

async def _broadcast_debate_event(debate_id, etype, data):
    try:
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            ch = await connection.channel()
            ex = await ch.declare_exchange('debate_events', aio_pika.ExchangeType.TOPIC, durable=False)
            msg = aio_pika.Message(json.dumps({"type": etype, "timestamp": time.time(), "data": data, "debate_id": debate_id}).encode())
            await ex.publish(msg, routing_key=f'debate.events.{debate_id}')
    except Exception: pass

async def store_wandb_metadata(debate_id, meta, cfg):
    try:
        p_args = {"seed": str(cfg.get("seed", 0)), "task": meta.get("task"), "experiment.name": cfg.get("experiment", {}).get("name")}
        db = DatabaseManager()
        async with db.get_session() as s:
            await s.execute(update(Debate).where(Debate.id == uuid.UUID(debate_id)).values(wandb_metadata={"parsed_args": p_args}))
            await s.commit()
    except Exception: pass

@celery_app.task(name="src.api.tasks.submit_human_response")
def submit_human_response(debate_id: str, response_text: str, extracted_answer: str):
    async def _publish():
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            ch = await connection.channel()
            ex = await ch.declare_exchange('human_responses', aio_pika.ExchangeType.DIRECT, durable=True)
            msg = aio_pika.Message(
                json.dumps({"response_text": response_text, "extracted_answer": extracted_answer, "timestamp": datetime.utcnow().isoformat()}).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT
            )
            await ex.publish(msg, routing_key=debate_id)
    
    try:
        asyncio.run(_publish())
        return {"success": True}
    except Exception as e:
        raise ValueError(f"Failed to queue response: {str(e)}")

@celery_app.task(name="src.api.tasks.get_debate_status")
def get_debate_status(debate_id: str) -> Dict[str, Any]:
    cleanup_idle_orchestrators()
    if debate_id not in ACTIVE_ORCHESTRATORS: return {"status": "not_found"}
    orch, last = ACTIVE_ORCHESTRATORS[debate_id]
    return {"status": "active", "debate_status": orch.get_status(), "last_activity": last}

@celery_app.task(name="src.api.tasks.cleanup_orchestrators_task")
def cleanup_orchestrators_task():
    cleanup_idle_orchestrators()
    return {"active": len(ACTIVE_ORCHESTRATORS)}