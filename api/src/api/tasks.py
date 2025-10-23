"""
Celery tasks for running debates with human-in-the-loop support.
Updated to use per-debate orchestrators with timeout cleanup.
"""
import asyncio
import logging
import time, os
import uuid, json
import aio_pika
from typing import Dict, Any, Optional
from celery import Task
from datetime import datetime

from src.api.celery_app import celery_app
from src.debates.basic_debate import BasicDebateOrchestrator
from src.database.database import DatabaseManager, Debate
from src.database.repository import DebateRepository

logger = logging.getLogger(__name__)

ACTIVE_ORCHESTRATORS: Dict[str, tuple[BasicDebateOrchestrator, float]] = {}
ORCHESTRATOR_TIMEOUT = 600  # 10 minutes


def cleanup_idle_orchestrators():
    """Remove orchestrators that have been idle for too long."""
    current_time = time.time()
    to_remove = []
    
    for debate_id, (orchestrator, last_activity) in ACTIVE_ORCHESTRATORS.items():
        if current_time - last_activity > ORCHESTRATOR_TIMEOUT:
            to_remove.append(debate_id)
            logger.info(f"⏱️ Timing out idle orchestrator for debate {debate_id}")
    
    for debate_id in to_remove:
        ACTIVE_ORCHESTRATORS.pop(debate_id, None)
    
    if to_remove:
        logger.info(f"🧹 Cleaned up {len(to_remove)} idle orchestrators")


def get_or_create_orchestrator(debate_id: str) -> BasicDebateOrchestrator:
    """Get existing orchestrator or create new one."""
    cleanup_idle_orchestrators()
    
    if debate_id in ACTIVE_ORCHESTRATORS:
        orchestrator, _ = ACTIVE_ORCHESTRATORS[debate_id]
        ACTIVE_ORCHESTRATORS[debate_id] = (orchestrator, time.time())
        logger.info(f"♻️ Reusing existing orchestrator for debate {debate_id}")
        return orchestrator
    
    orchestrator = BasicDebateOrchestrator()
    ACTIVE_ORCHESTRATORS[debate_id] = (orchestrator, time.time())
    logger.info(f"Created new orchestrator for debate {debate_id}")
    return orchestrator


def update_orchestrator_activity(debate_id: str):
    """Update the last activity timestamp for an orchestrator."""
    if debate_id in ACTIVE_ORCHESTRATORS:
        orchestrator, _ = ACTIVE_ORCHESTRATORS[debate_id]
        ACTIVE_ORCHESTRATORS[debate_id] = (orchestrator, time.time())


def remove_orchestrator(debate_id: str):
    """Remove an orchestrator (e.g., when debate completes or errors)."""
    if debate_id in ACTIVE_ORCHESTRATORS:
        ACTIVE_ORCHESTRATORS.pop(debate_id)
        logger.info(f"🗑️ Removed orchestrator for debate {debate_id}")


@celery_app.task(
    name="src.api.tasks.run_debate_task",
    bind=True,
    track_started=True,
)
def run_debate_task(
    self, 
    debate_id: str, 
    debate_type: str = "basic_debate",
    hydra_cfg: dict = None,
    questions: list = None,
    num_rounds: int = 3,
    num_agents: int = 2,
    agent_models: list = None,
    human_agent_index: int = None,
    enhanced_metadata: dict = None,
    **kwargs
):
    """
    Run a debate task with a fresh orchestrator per debate.
    Compatible with both standard asyncio and gevent pools.
    
    Args:
        debate_id: Unique identifier for the debate
        debate_type: Type of debate to run (default: "basic_debate")
        hydra_cfg: Hydra configuration dictionary
        questions: List of questions for the debate
        num_rounds: Number of debate rounds
        num_agents: Number of agents
        human_agent_index: Index of human agent (if any)
        enhanced_metadata: Enhanced metadata including agent info
        **kwargs: Additional arguments (for compatibility)
    """
    logger.info(f"TASK STARTED: {debate_type} debate {debate_id}")
    logger.info(f"Questions: {len(questions) if questions else 0}, Rounds: {num_rounds}, Agents: {num_agents}")
    
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
        logger.info("Running with standard asyncio")
        result = asyncio.run(_run_debate_async(debate_id, config_dict))
        
        logger.info(f"TASK COMPLETED: debate {debate_id}")
        return result
        
    except Exception as e:
        logger.error(f"TASK FAILED: debate {debate_id}: {e}", exc_info=True)
        remove_orchestrator(debate_id)
        raise

async def _run_debate_async(debate_id: str, config_dict: dict) -> Dict[str, Any]:
    """
    Async function that handles the actual debate execution.
    """
    orchestrator = get_or_create_orchestrator(debate_id)    
    rabbitmq_url = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@localhost:5672/")
    connection = None
    channel = None
    human_response_queue = None
    human_ready_queue = None
    
    try:
        questions = config_dict.get('questions', [])
        num_rounds = config_dict.get('num_rounds', 3)
        num_agents = config_dict.get('num_agents', 1)
        agent_models = config_dict.get('agent_models', [])
        human_agent_index = config_dict.get('human_agent_index')
        enhanced_metadata = config_dict.get('enhanced_metadata')
        
        if human_agent_index is None and agent_models:
            for idx, model in enumerate(agent_models):
                if model.lower() in ['human-participant', 'human', 'mock/human']:
                    human_agent_index = idx
                    logger.info(f"🔍 Detected human agent at index {idx}")
                    break
        
        logger.info(f"Questions: {len(questions)}, Rounds: {num_rounds}, Agents: {num_agents}")
        logger.info(f"Agent models order: {agent_models}")
        logger.info(f"Human agent index: {human_agent_index}")
        
        if human_agent_index is not None:
            connection = await aio_pika.connect_robust(rabbitmq_url)
            channel = await connection.channel()
            
            human_response_exchange = await channel.declare_exchange(
                'human_responses',
                aio_pika.ExchangeType.DIRECT,
                durable=True
            )
            
            human_response_queue = await channel.declare_queue(
                f'human_response_{debate_id}',
                durable=True,
                auto_delete=False,
                exclusive=False
            )
            await human_response_queue.bind(human_response_exchange, routing_key=debate_id)
            
            human_ready_queue = await channel.declare_queue(
                f'human_ready_{debate_id}',
                durable=True,
                auto_delete=False,
                exclusive=False
            )
            await human_ready_queue.bind(human_response_exchange, routing_key=f"{debate_id}_ready")
            
            logger.info(f"Setup RabbitMQ queues for debate {debate_id}")
            logger.info(f"Waiting for human participant to connect...")
            await _broadcast_debate_event(debate_id, "waiting_for_human_connection", {
                "message": "Please connect to continue the debate"
            })
            
            try:
                async with human_ready_queue.iterator() as queue_iter:
                    async def get_ready_signal():
                        async for message in queue_iter:
                            return message
                    
                    message = await asyncio.wait_for(
                        get_ready_signal(),
                        timeout=600
                    )
                    
                    async with message.process():
                        logger.info(f"Human participant connected for debate {debate_id}")
                        
            except asyncio.TimeoutError:
                logger.error(f"Timeout waiting for human connection in debate {debate_id}")
                raise Exception("Human participant did not connect within 60 seconds")
                
        else:
            logger.info(f"No human agent - skipping RabbitMQ setup")
        
        if orchestrator.status == "initialized":
            await orchestrator.initialize_from_hydra(
                debate_id=uuid.UUID(debate_id),
                hydra_cfg=config_dict,
                questions=questions,
                num_rounds=num_rounds,
                num_agents=num_agents,
                agent_models=agent_models,
                summarize=config_dict.get('summarize', True)
            )
            
            if enhanced_metadata:
                hydra_cfg = config_dict.get('hydra_cfg') or config_dict
                await _store_wandb_metadata(debate_id, enhanced_metadata, hydra_cfg)
            
            await _broadcast_debate_event(debate_id, "debate_started", {
                "debate_id": debate_id,
                "num_questions": len(questions),
                "num_rounds": num_rounds,
                "num_agents": num_agents,
                "agent_models": agent_models,
                "human_agent_index": human_agent_index
            })
        
        for question_idx, question_data in enumerate(questions):
            logger.info(f"Processing question {question_idx + 1}/{len(questions)}")
            
            question_text = question_data.get('question', '')
            correct_answer = question_data.get('answer', '')
            question_prompt = question_data.get('question_prompt')
            
            if not isinstance(question_text, str):
                question_text = str(question_text)
            if not isinstance(correct_answer, str):
                correct_answer = str(correct_answer)

            actual_question = question_prompt or question_text
            logger.info(f"Question: {actual_question[:200]}")
            logger.info(f"Correct answer: {correct_answer}")

            question_session = await _create_question_and_session(
                debate_id, 
                question_data, 
                num_rounds
            )
            
            orchestrator.current_question_session_id = question_session.id
            
            await _broadcast_debate_event(debate_id, "question_started", {
                "question_index": question_idx,
                "question_text": question_text,
                "question_session_id": str(question_session.id)
            })
            
            for agent in orchestrator.agents:
                await agent.reset()
                agent.set_instruction(actual_question)
            
            human_answer = None
            
            for round_num in range(num_rounds):
                update_orchestrator_activity(debate_id)
                
                await _broadcast_debate_event(debate_id, "round_started", {
                    "round_number": round_num,
                    "question_index": question_idx
                })
                
                logger.info(f"=== STARTING ROUND {round_num} ===")
                
                class RoundResult:
                    def __init__(self, round_number):
                        self.responses = {}
                        self.round_number = round_number
                    
                    def add_response(self, name, text):
                        self.responses[name] = text
                
                round_result = RoundResult(round_num)
                
                if human_agent_index is not None and orchestrator.human_agent_name:
                    previous_responses = {}
                    if round_num > 0:
                        for agent in orchestrator.agents:
                            if hasattr(agent, 'answer_history') and len(agent.answer_history) > 0:
                                agent_name = agent.name
                                if agent_name != orchestrator.human_agent_name:
                                    previous_responses[agent_name] = agent.answer_history[-1]
                        logger.info(f"Showing {len(previous_responses)} previous AI responses to human")
                    
                    await _broadcast_debate_event(debate_id, "waiting_for_human", {
                        "question_index": question_idx,
                        "round_number": round_num,
                        "question_text": question_text,
                        "other_responses": previous_responses,
                    })

                    logger.info(f"Waiting for human response - debate {debate_id}, round {round_num}")
                    
                    try:
                        received = False
                        timeout = 300  # 5 minutes
                        
                        async with human_response_queue.iterator() as queue_iter:
                            async def get_message_with_timeout():
                                async for message in queue_iter:
                                    return message
                                raise TimeoutError("No message received")
                            
                            message = await asyncio.wait_for(
                                get_message_with_timeout(),
                                timeout=timeout
                            )
                            
                            async with message.process():
                                response_data = json.loads(message.body.decode())
                                human_response = response_data['response_text']
                                human_answer_extracted = response_data['extracted_answer']
                                
                                logger.info(f"Received human response from RabbitMQ")
                                logger.info(f"Response: {human_response[:100]}...")
                                logger.info(f"Extracted answer: {human_answer_extracted}")
                                
                                human_answer = human_answer_extracted
                                
                                round_result.add_response(orchestrator.human_agent_name, human_response)
                                
                                human_agent = orchestrator.agents[human_agent_index]
                                if hasattr(human_agent, 'answer_history'):
                                    human_agent.answer_history.append(human_response)
                                    logger.info(f"Added human response to agent's answer_history")
                                
                                update_orchestrator_activity(debate_id)
                                received = True
                        
                        if not received:
                            raise TimeoutError("No human response received")
                        
                    except asyncio.TimeoutError:
                        logger.error(f"⏱️ Timeout waiting for human response in debate {debate_id}")
                    
                    logger.info(f"Human responded, now running AI agents")
                    ai_round_result = await orchestrator._run_debate_round(
                        question=question_text,
                        question_prompt=question_prompt,
                        round_number=round_num,
                        skip_agent_index=human_agent_index 
                    )
                    
                    for agent_name, response_text in ai_round_result.responses.items():
                        round_result.add_response(agent_name, response_text)
                    
                    logger.info(f"Broadcasting AI agent responses to human")
                    await _broadcast_debate_event(debate_id, "ai_responses_ready", {
                        "round_number": round_num,
                        "question_index": question_idx,
                        "ai_responses": {k: v for k, v in round_result.responses.items() 
                                        if k != orchestrator.human_agent_name}
                    })
                    
                else:
                    round_result = await orchestrator._run_debate_round(
                        question=question_text,
                        question_prompt=question_prompt,
                        round_number=round_num,
                        skip_agent_index=None
                    )
                
                logger.info(f"=== ROUND {round_num} COMPLETE ===")
                logger.info(f"Collected responses from: {list(round_result.responses.keys())}")
                
                await orchestrator._store_round(
                    round_data=round_result,
                    correct_answer=correct_answer,
                    human_agent_index=human_agent_index,
                    human_extracted_answer=human_answer if human_agent_index is not None else None
                )
                
                await _broadcast_debate_event(debate_id, "round_completed", {
                    "round_number": round_num,
                    "question_index": question_idx,
                    "responses": round_result.responses
                })
            
            await orchestrator._complete_question_session()
            
            await _broadcast_debate_event(debate_id, "question_completed", {
                "question_index": question_idx
            })
        
        await orchestrator._complete_debate()
        
        await _broadcast_debate_event(debate_id, "debate_completed", {
            "debate_id": debate_id,
            "questions_processed": len(questions)
        })
        
        remove_orchestrator(debate_id)
        
        return {
            "status": "completed",
            "debate_id": debate_id,
            "questions_processed": len(questions)
        }
        
    except Exception as e:
        logger.error(f"Error in debate execution: {e}", exc_info=True)
        
        await _broadcast_debate_event(debate_id, "debate_error", {
            "error": str(e),
            "error_type": type(e).__name__
        })
        
        remove_orchestrator(debate_id)
        raise
    
    finally:
        try:
            if human_response_queue:
                await human_response_queue.delete()
                logger.info(f"🗑️ Deleted RabbitMQ queue for debate {debate_id}")
        except Exception as e:
            logger.warning(f"Failed to delete queue: {e}")
        
        try:
            if channel and not channel.is_closed:
                await channel.close()
        except Exception as e:
            logger.warning(f"Failed to close channel: {e}")
        
        try:
            if connection and not connection.is_closed:
                await connection.close()
        except Exception as e:
            logger.warning(f"Failed to close connection: {e}")

async def _create_question_and_session(
    debate_id: str,
    question_data: Dict[str, Any],
    num_rounds: int
):
    """Create question and question session in database."""
    import hashlib
    
    question_text = question_data.get('question', '')
    correct_answer = question_data.get('answer', '')
    question_prompt = question_data.get('question_prompt')
    
    unique_str = f"{debate_id}_{question_text}_{correct_answer}"
    hash_value = int(hashlib.sha256(unique_str.encode()).hexdigest()[:8], 16)
    question_id = hash_value % 2147483647
    
    logger.info(f"Creating new question with ID: {question_id}")
    
    db_manager = DatabaseManager()
    async with db_manager.get_session() as session:
        repo = DebateRepository(session)
        
        logger.info(f"get_or_create_question called with question_id={question_id}")
        question_obj = await repo.get_or_create_question(
            question_id=question_id,
            question_text=question_text,
            correct_answer=str(correct_answer),
            question_prompt=question_prompt
        )
        
        await session.commit()
        await session.refresh(question_obj)
        
        logger.info(f"Created question: ID={question_obj.id}")
        
        logger.info(f"Creating question session for question ID: {question_obj.id}")
        question_session = await repo.create_question_session(
            debate_id=uuid.UUID(debate_id),
            question_id=question_obj.id,
            total_rounds=num_rounds
        )
        
        await session.commit()
        await session.refresh(question_session)
        
        logger.info(f"Question session created: ID={question_session.id}")
        
        return question_session


async def _broadcast_debate_event(debate_id: str, event_type: str, data: Dict[str, Any]):
    """Broadcast debate event via WebSocket or other mechanism."""
    try:
        logger.info(f"Broadcasting {event_type} for debate {debate_id}")
        logger.info(f"Event data: {data}")
        
        from src.api.websocket_manager import broadcast_to_debate
        await broadcast_to_debate(debate_id, {
            "type": event_type,
            "timestamp": time.time(),
            "data": data,
            "debate_id": debate_id
        })
        
        logger.info(f"Successfully broadcasted {event_type} to debate {debate_id}")
        
    except Exception as e:
        logger.error(f"Failed to broadcast event {event_type}: {e}", exc_info=True)


async def _store_wandb_metadata(debate_id: str, enhanced_metadata: dict, hydra_cfg: dict):
    """Store enhanced wandb metadata in the database."""
    try:
        llm_configs = enhanced_metadata.get("llm_configs", {})
        
        parsed_args = {
            "seed": str(hydra_cfg.get("seed", enhanced_metadata.get("seed", 0))),
            "task": enhanced_metadata.get("task", "unknown"),
            "has_custom_questions": enhanced_metadata.get("has_custom_questions", False),
            "debug": False,
            "cost_check": False,
            "experiment.name": hydra_cfg.get("experiment", {}).get("name", enhanced_metadata.get("debate_type", "unnamed")),
            "experiment.num_rounds": enhanced_metadata.get("num_rounds", 2),
            "experiment.num_questions": enhanced_metadata.get("num_questions", 1),
        }
        
        if llm_configs.get("llm1"):
            parsed_args["llm_conf@llm1"] = llm_configs["llm1"]["model"]
            parsed_args["agent_counts.0"] = llm_configs["llm1"]["count"]
        
        if llm_configs.get("llm2") and llm_configs["llm2"]:
            parsed_args["llm_conf@llm2"] = llm_configs["llm2"]["model"]
            parsed_args["agent_counts.1"] = llm_configs["llm2"]["count"]
        
        if llm_configs.get("llm3") and llm_configs["llm3"]:
            parsed_args["llm_conf@llm3"] = llm_configs["llm3"]["model"]
            parsed_args["agent_counts.2"] = llm_configs["llm3"]["count"]
        
        wandb_metadata = {
            "startedAt": datetime.utcnow().isoformat(),
            "parsed_args": parsed_args,
        }
        
        logger.info(f"Storing wandb metadata for debate {debate_id}")
        logger.info(f"Metadata: {json.dumps(wandb_metadata, indent=2)}")
        
        db_manager = DatabaseManager()
        async with db_manager.get_session() as session:
            repo = DebateRepository(session)            
            from sqlalchemy import update
            await session.execute(
                update(Debate)
                .where(Debate.id == uuid.UUID(debate_id))
                .values(wandb_metadata=wandb_metadata)
            )
            await session.commit()
            
        logger.info(f"Stored wandb metadata for debate {debate_id}")
        
    except Exception as e:
        logger.error(f"Failed to store wandb metadata: {e}", exc_info=True)

@celery_app.task(name="src.api.tasks.submit_human_response")
def submit_human_response(debate_id: str, response_text: str, extracted_answer: str):
    """
    Submit a human response to an ongoing debate.
    This is called from the HTTP endpoint and needs to put data in an async queue.
    
    Args:
        debate_id: The debate ID
        response_text: The human's response text
        extracted_answer: The extracted answer from the response
    """
    logger.info(f"Human response submitted for debate {debate_id}")
    logger.info(f"Response text: {response_text[:100]}...")
    logger.info(f"Extracted answer: {extracted_answer}")
    
    if debate_id not in ACTIVE_ORCHESTRATORS:
        logger.error(f"No active orchestrator found for debate {debate_id}")
        logger.info(f"Available orchestrators: {list(ACTIVE_ORCHESTRATORS.keys())}")
        raise ValueError(f"Debate {debate_id} not found or has timed out")
    
    orchestrator, _ = ACTIVE_ORCHESTRATORS[debate_id]
    
    try:
        loop = orchestrator.human_response_queue._loop        
        loop.call_soon_threadsafe(
            orchestrator.human_response_queue.put_nowait,
            (response_text, extracted_answer)
        )
        
        update_orchestrator_activity(debate_id)
        logger.info(f"Human response queued for debate {debate_id}")
        
        return {
            "success": True,
            "message": "Response queued successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to queue human response: {e}", exc_info=True)
        raise ValueError(f"Failed to queue response: {str(e)}")


@celery_app.task(name="src.api.tasks.get_debate_status")
def get_debate_status(debate_id: str) -> Dict[str, Any]:
    """Get the current status of a debate."""
    cleanup_idle_orchestrators()
    
    if debate_id not in ACTIVE_ORCHESTRATORS:
        return {
            "status": "not_found",
            "message": "Debate not found or has timed out"
        }
    
    orchestrator, last_activity = ACTIVE_ORCHESTRATORS[debate_id]
    
    return {
        "status": "active",
        "debate_status": orchestrator.get_status(),
        "last_activity": last_activity,
        "time_until_timeout": ORCHESTRATOR_TIMEOUT - (time.time() - last_activity)
    }

@celery_app.task(name="src.api.tasks.cleanup_orchestrators_task")
def cleanup_orchestrators_task():
    """Periodic task to clean up idle orchestrators."""
    cleanup_idle_orchestrators()
    return {
        "active_orchestrators": len(ACTIVE_ORCHESTRATORS),
        "timestamp": time.time()
    }