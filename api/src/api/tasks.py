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
        logger.info(f"Removed orchestrator for debate {debate_id}")


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

@celery_app.task(
    name="src.api.tasks.run_replay_task",
    bind=True,
    track_started=True,
)
def run_replay_task(
    self,
    debate_id: str,
    debate_type: str = "basic_debate",
    original_config: dict = None,
    questions: list = None,
    num_rounds: int = 3,
    experiment_name: str = "replay_debate",
    previous_rounds: list = None,
    start_from_round: int = 0,
    replace_agent_index: int = None,
    replace_agent_name: str = None,
    enhanced_metadata: dict = None,
    **kwargs
):
    """
    Replay a debate from a specific round with human replacement.
    
    This task handles all config reconstruction and agent setup logic.
    """
    logger.info(f"REPLAY TASK STARTED: {debate_type} debate {debate_id}")
    logger.info(f"Starting from round {start_from_round}, replacing agent: index={replace_agent_index}, name={replace_agent_name}")
    
    try:
        result = asyncio.run(_run_replay_async(
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
        
        logger.info(f"REPLAY TASK COMPLETED: debate {debate_id}")
        return result

    except Exception as e:
        logger.error(f"REPLAY TASK FAILED: debate {debate_id}: {e}", exc_info=True)
        remove_orchestrator(debate_id)
        raise

async def _run_replay_async(
    debate_id: str,
    original_config: dict,
    questions: list,
    num_rounds: int,
    experiment_name: str,
    previous_rounds: list,
    start_from_round: int,
    replace_agent_index: int,
    replace_agent_name: str,
    enhanced_metadata: dict = None,
    **kwargs
) -> dict:
    """Execute the replay with full config reconstruction."""
    
    human_agent_index = replace_agent_index
    
    # Validate config
    _validate_replay_config(original_config, start_from_round)
    
    orchestrator = get_or_create_orchestrator(debate_id)
    rabbitmq_url = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@localhost:5672/")
    connection = None
    channel = None
    human_response_queue = None
    human_ready_queue = None
    
    try:
        # Reconstruct from wandb_metadata directly
        wandb_metadata = original_config.get("wandb_metadata", {})
        parsed_args = wandb_metadata.get("parsed_args", {})
        
        # Build agent_models list from parsed_args
        agent_models = []

        # Extract llm configs from parsed_args
        llm_configs = {}
        for key, value in parsed_args.items():
            if key.startswith('llm_conf@'):
                llm_key = key.split('@')[1]
                llm_configs[llm_key] = value

        # Extract agent counts
        agent_counts = {}
        for key, value in parsed_args.items():
            if key.startswith('agent_counts.'):
                idx = key.split('.')[1]
                agent_counts[idx] = value

        logger.info(f"Found LLM configs: {llm_configs}")
        logger.info(f"Found agent counts: {agent_counts}")

        # Reconstruct agent_models list
        for idx in sorted(agent_counts.keys()):
            count = agent_counts[idx]
            llm_key = f"llm{int(idx) + 1}"
            
            if llm_key in llm_configs and count > 0:
                model_name = llm_configs[llm_key]
                for _ in range(count):
                    agent_models.append(model_name)
                logger.info(f"Added {count} agents of type {model_name}")

        # If we still don't have agents, try total_agents fallback
        if not agent_models:
            total_agents = parsed_args.get('total_agents', 0)
            if total_agents > 0 and llm_configs:
                llm_list = list(llm_configs.values())
                agents_per_model = total_agents // len(llm_list)
                remainder = total_agents % len(llm_list)
                
                for idx, model in enumerate(llm_list):
                    count = agents_per_model + (1 if idx < remainder else 0)
                    for _ in range(count):
                        agent_models.append(model)
                
                logger.warning(f"Reconstructed {len(agent_models)} agents from total_agents")

        if not agent_models:
            raise ValueError(f"Could not reconstruct agent_models from wandb_metadata: {parsed_args}")

        logger.info(f"Reconstructed agent_models: {agent_models}")
        
        # Find human_agent_index if using name
        if human_agent_index is None and replace_agent_name:
            human_agent_index = _find_agent_index_by_name(agent_models, replace_agent_name)
            if human_agent_index is None:
                raise ValueError(f"Agent '{replace_agent_name}' not found in {agent_models}")
        
        # Replace the agent with human
        if human_agent_index is not None:
            logger.info(f"Replacing agent at index {human_agent_index} with human")
            agent_models[human_agent_index] = "human-participant"
        
        logger.info("=" * 80)
        logger.info("REPLAY CONFIGURATION SUMMARY")
        logger.info(f"Debate ID: {debate_id}")
        logger.info(f"Start from round: {start_from_round}")
        logger.info(f"Total rounds: {num_rounds}")
        logger.info(f"Human agent index: {human_agent_index}")
        logger.info(f"Agent models: {agent_models}")
        logger.info("=" * 80)
        
        # Build Hydra config from the reconstructed agent_models
        hydra_cfg = _build_hydra_config_for_replay_simple(
            original_config=original_config,
            agent_models=agent_models,
            num_rounds=num_rounds,
            experiment_name=experiment_name
        )
        
        # Setup RabbitMQ for human participant
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
        
        logger.info(f"Setup RabbitMQ queues for replay debate {debate_id}")
        
        # Initialize orchestrator
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
        
        logger.info(f"Waiting for human participant to connect...")
        await _broadcast_debate_event(debate_id, "waiting_for_human_connection", {
            "message": "Please connect to continue the replay"
        })

        try:
            logger.info(f"Starting to consume from human_ready queue...")
            logger.info(f"Queue details: {human_ready_queue.name}")
            
            # Create consumer with timeout
            async def wait_for_ready_message():
                """Consume messages until we get the ready signal."""
                logger.info(f"Waiting for message on queue {human_ready_queue.name}")
                
                try:
                    async with human_ready_queue.iterator() as queue_iter:
                        async for message in queue_iter:
                            async with message.process():
                                try:
                                    logger.info(f"Received raw message body length: {len(message.body)}")
                                    data = json.loads(message.body.decode())
                                    logger.info(f"Parsed ready signal: {data}")
                                    
                                    # Accept any message as ready signal
                                    # The presence of a message means frontend is ready
                                    return True
                                    
                                except json.JSONDecodeError as e:
                                    logger.warning(f"Received invalid ready signal: {e}")
                                    # Even invalid JSON means frontend is trying to connect
                                    return True
                                except Exception as e:
                                    logger.error(f"Error processing ready message: {e}")
                                    continue
                except Exception as e:
                    logger.error(f"Error in queue iterator: {e}", exc_info=True)
                    return False
                
                return False
            
            # Wait with timeout
            try:
                logger.info("Starting to wait for ready message with 600s timeout...")
                ready = await asyncio.wait_for(wait_for_ready_message(), timeout=600)
                
                if ready:
                    logger.info(f"✓✓✓ Human participant connected for replay {debate_id}")
                    logger.info(f"✓✓✓ Proceeding with replay execution")
                else:
                    raise Exception("Failed to receive valid ready signal")
                    
            except asyncio.TimeoutError:
                logger.error(f"Timeout waiting for human connection after 600 seconds")
                logger.error(f"Queue name: {human_ready_queue.name}")
                raise Exception("Human participant did not connect within timeout")
                
        except Exception as e:
            logger.error(f"Error waiting for human connection: {e}", exc_info=True)
            raise

        # Continue execution
        logger.info(f"Questions to process: {len(questions)}")
        logger.info(f"Starting from round: {start_from_round}")
        logger.info(f"Total rounds: {num_rounds}")
        
        # Continue with the rest of the replay logic...
        for question_idx, question_data in enumerate(questions):
            question_text = question_data.get("question", "")
            question_prompt = question_data.get("question_prompt")
            correct_answer = question_data.get("answer", "")

            question_session = await _create_question_and_session(
                debate_id, question_data, num_rounds
            )
            orchestrator.current_question_session_id = question_session.id
            if previous_rounds and start_from_round > 0:
                logger.info(f"Restoring {len(previous_rounds)} previous round(s) to agent history")
                
                for prev_round_idx in range(start_from_round):
                    if prev_round_idx < len(previous_rounds):
                        prev_round_data = previous_rounds[prev_round_idx]
                        prev_responses = prev_round_data.get('responses', {})
                        
                        logger.info(f"=== RESTORING ROUND {prev_round_idx} ===")
                        logger.info(f"Available responses: {list(prev_responses.keys())}")
                        logger.info(f"Number of agents to restore to: {len(orchestrator.agents)}")                        
                        used_prev_responses = set()                        
                        for agent_idx, agent in enumerate(orchestrator.agents):
                            logger.info(f"Processing agent {agent_idx}: {agent.name}")
                            agent_response = None
                            curr_model = agent.name.split('_agent_')[0]
                            curr_normalized = normalize_model_name(curr_model)
                            
                            logger.info(f"  Matching agent {agent_idx} ({agent.name}, normalized: {curr_normalized})")                            
                            if agent_idx == human_agent_index and replace_agent_name:
                                target_normalized = normalize_model_name(replace_agent_name)
                                logger.info(f"    Looking for replaced agent: {replace_agent_name} (normalized: {target_normalized})")
                                
                                for prev_agent_name, prev_response in prev_responses.items():
                                    if prev_agent_name in used_prev_responses:
                                        continue
                                        
                                    prev_model = prev_agent_name.split('_agent_')[0]
                                    prev_normalized = normalize_model_name(prev_model)
                                    
                                    logger.info(f"      Checking {prev_agent_name} (normalized: {prev_normalized})")
                                    
                                    if prev_normalized == target_normalized:
                                        agent_response = prev_response
                                        used_prev_responses.add(prev_agent_name)
                                        logger.info(f"    ✓ Found response for human replacement (matched {prev_agent_name})")
                                        break
                            
                            # Strategy 2: Match by model type AND position (for non-human agents)
                            if not agent_response and curr_normalized != 'human-participant':
                                logger.info(f"    Looking for AI agent of type: {curr_normalized}")
                                
                                # Get the model being replaced to exclude it
                                replace_normalized = normalize_model_name(replace_agent_name) if replace_agent_name else None
                                
                                # Count how many agents of this type we've already matched
                                # This ensures we match the Nth agent to the Nth previous response
                                same_type_count = sum(
                                    1 for i in range(agent_idx) 
                                    if normalize_model_name(orchestrator.agents[i].name.split('_agent_')[0]) == curr_normalized
                                )
                                
                                logger.info(f"    This is the {same_type_count + 1}th agent of type {curr_normalized}")
                                
                                # Find the Nth unused response of the same type
                                found_count = 0
                                for prev_agent_name, prev_response in prev_responses.items():
                                    if prev_agent_name in used_prev_responses:
                                        continue
                                        
                                    prev_model = prev_agent_name.split('_agent_')[0]
                                    prev_normalized = normalize_model_name(prev_model)
                                    
                                    logger.info(f"      Checking {prev_agent_name} (normalized: {prev_normalized})")
                                    
                                    # Match by model type, but skip the agent being replaced
                                    if prev_normalized == curr_normalized and prev_normalized != replace_normalized:
                                        if found_count == same_type_count:
                                            agent_response = prev_response
                                            used_prev_responses.add(prev_agent_name)
                                            logger.info(f"    ✓ Found response by position match (matched {prev_agent_name})")
                                            break
                                        else:
                                            found_count += 1
                                            logger.info(f"      Skipping (looking for position {same_type_count}, this is {found_count - 1})")
                                
                                if not agent_response:
                                    logger.warning(f"    ✗ No match found for {agent.name}")
                                    logger.warning(f"      Available agents: {[normalize_model_name(n.split('_agent_')[0]) for n in prev_responses.keys() if n not in used_prev_responses]}")
                            
                            # Add to agent history if found
                            if agent_response:
                                if hasattr(agent, 'answer_history'):
                                    agent.answer_history.append(agent_response)
                                    logger.info(f"  ✓ Restored to {agent.name}, history now: {len(agent.answer_history)}")
                                else:
                                    logger.error(f"  ✗ Agent {agent.name} missing answer_history!")
                            else:
                                logger.warning(f"  ✗ No match found for {agent.name}")
                
                logger.info(f"✓ Restored previous rounds. Final agent histories:")
                for agent in orchestrator.agents:
                    if hasattr(agent, 'answer_history'):
                        logger.info(f"  {agent.name}: {len(agent.answer_history)} previous responses")
                    else:
                        logger.info(f"  {agent.name}: NO answer_history attribute")

            for round_num in range(start_from_round, num_rounds):
                update_orchestrator_activity(debate_id)
                logger.info(f"Replaying round {round_num} for question {question_idx}")

                # Build context from completed rounds
                all_previous_rounds = {}
                actual_completed_rounds = 0
                if orchestrator.agents and hasattr(orchestrator.agents[0], 'answer_history'):
                    actual_completed_rounds = len(orchestrator.agents[0].answer_history)

                logger.info(f"Building context from {actual_completed_rounds} completed rounds")

                for prev_round_idx in range(actual_completed_rounds):
                    round_key = f"round_{prev_round_idx}"
                    all_previous_rounds[round_key] = {}
                    
                    for agent in orchestrator.agents:
                        if hasattr(agent, 'answer_history') and len(agent.answer_history) > prev_round_idx:
                            display_name = agent.name
                            
                            if agent.name == orchestrator.human_agent_name and replace_agent_name:
                                display_name = f"{replace_agent_name}_agent_0"
                            
                            response = agent.answer_history[prev_round_idx]
                            all_previous_rounds[round_key][display_name] = response
                            logger.info(f"  Round {prev_round_idx} - {display_name}: {response[:80]}...")
                        else:
                            logger.warning(f"  Round {prev_round_idx} - {agent.name}: No response")

                logger.info(f"Showing {len(all_previous_rounds)} previous rounds to human")

                # Broadcast waiting_for_human event
                await _broadcast_debate_event(debate_id, "waiting_for_human", {
                    "question_index": question_idx,
                    "round_number": round_num,
                    "question_text": question_text,
                    "previous_rounds": all_previous_rounds,
                    "replace_agent_name": replace_agent_name 
                })
                # Wait for human response
                logger.info(f"Waiting for human response - round {round_num}")
                try:
                    async def wait_for_human_response():
                        """Consume messages until we get a valid response."""
                        async with human_response_queue.iterator() as queue_iter:
                            async for message in queue_iter:
                                async with message.process():
                                    try:
                                        response_data = json.loads(message.body.decode())
                                        return response_data
                                    except json.JSONDecodeError:
                                        logger.warning("Received invalid response message")
                                        continue
                        return None
                    
                    response_data = await asyncio.wait_for(
                        wait_for_human_response(),
                        timeout=300
                    )
                    
                    if not response_data:
                        raise Exception("Failed to receive valid human response")
                    
                    human_response = response_data['response_text']
                    human_answer = response_data.get('extracted_answer')
                    
                    logger.info(f"Received human response")
                    update_orchestrator_activity(debate_id)
                    
                    # Add to human agent's history
                    if orchestrator.human_agent_name:
                        human_agent = orchestrator.agents[human_agent_index]
                        if hasattr(human_agent, 'answer_history'):
                            human_agent.answer_history.append(human_response)
                    
                except asyncio.TimeoutError:
                    logger.error(f"Timeout waiting for human response")
                    raise

                # Execute round with AI agents (human already responded)
                round_result = await orchestrator._run_debate_round(
                    question=question_text,
                    question_prompt=question_prompt,
                    round_number=round_num,
                    skip_agent_index=human_agent_index
                )
                
                # Add human response to round result
                if orchestrator.human_agent_name:
                    round_result.add_response(orchestrator.human_agent_name, human_response)

                await _broadcast_debate_event(debate_id, "round_replayed", {
                    "question_index": question_idx,
                    "round_number": round_num,
                    "responses": round_result.responses
                })
                
                # Store the round
                await orchestrator._store_round(
                    round_data=round_result,
                    correct_answer=correct_answer,
                    human_agent_index=human_agent_index,
                    human_extracted_answer=human_answer
                )

            await orchestrator._complete_question_session()

        await orchestrator._complete_debate()
        
        await _broadcast_debate_event(debate_id, "debate_completed", {
            "debate_id": debate_id,
            "questions_processed": len(questions)
        })
        
        remove_orchestrator(debate_id)

        return {
            "status": "replay_completed",
            "debate_id": debate_id,
            "questions_processed": len(questions),
            "rounds_replayed": num_rounds - start_from_round
        }
        
    except Exception as e:
        logger.error(f"Error in replay execution: {e}", exc_info=True)
        await _broadcast_debate_event(debate_id, "debate_error", {
            "error": str(e),
            "error_type": type(e).__name__
        })
        remove_orchestrator(debate_id)
        raise
    
    finally:
        # Cleanup RabbitMQ resources
        try:
            if human_response_queue:
                await human_response_queue.delete()
        except Exception as e:
            logger.warning(f"Failed to delete response queue: {e}")
        
        try:
            if human_ready_queue:
                await human_ready_queue.delete()
        except Exception as e:
            logger.warning(f"Failed to delete ready queue: {e}")
        
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

def _build_hydra_config_for_replay_simple(
    original_config: dict,
    agent_models: list,
    num_rounds: int,
    experiment_name: str
) -> dict:
    """Build Hydra config directly from agent_models list."""
    from pathlib import Path
    from hydra import compose, initialize_config_dir
    from omegaconf import OmegaConf
    
    task = original_config.get("task", "gsm8k")
    seed = original_config.get("seed", 0)
    
    # Get unique non-human models
    unique_models = []
    for model in agent_models:
        normalized = normalize_model_name(model)
        if normalized != 'human-participant':
            if not any(normalize_model_name(m) == normalized for m in unique_models):
                unique_models.append(model)
    
    logger.info(f"Unique models for config: {unique_models}")
    
    # Build overrides
    config_dir = str(Path(__file__).parent.parent / "conf")
    overrides = [
        f"+task={task}",
        f"+experiment.num_questions=1",
        f"+experiment.num_rounds={num_rounds}",
        f"+experiment.name=replay_{experiment_name}",
        f"+cost_check={False}",
        f"++seed={seed}",
    ]
    
    # Add LLM configs
    for idx, model_name in enumerate(unique_models[:3]):
        llm_key = f"llm{idx + 1}"
        config_name = api_format_to_config_name(model_name)
        overrides.append(f"+llm_conf@{llm_key}={config_name}")
        logger.info(f"Added override: +llm_conf@{llm_key}={config_name}")
    
    with initialize_config_dir(config_dir=config_dir, version_base="1.1"):
        hydra_cfg = compose(config_name="config", overrides=overrides)
        OmegaConf.resolve(hydra_cfg)
    
    return OmegaConf.to_container(hydra_cfg, resolve=True)

def normalize_model_name(name: str) -> str:
    """Normalize model name for comparison."""
    normalized = name.lower()    
    normalized = normalized.replace('_', '-').replace('/', '-').replace('.', '-')    
    for prefix in ['vec-', 'together-']:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]    
    for suffix in ['-chat', '-instruct', '-turbo']:
        if normalized.endswith(suffix):
            normalized = normalized[:-len(suffix)]
    
    return normalized.strip('-')

def config_name_to_api_format(config_name: str) -> str:
    """
    Convert config file name to API format.
    Examples:
        gpt_3_5_turbo -> gpt-3.5-turbo
        gpt_4o_mini -> gpt-4o-mini
        human-participant -> human-participant (unchanged)
    """
    if not config_name or config_name == 'human-participant':
        return config_name
    
    # Handle GPT models specially
    if config_name.startswith('gpt_'):
        parts = config_name.split('_')
        if len(parts) == 4:  # gpt_3_5_turbo
            return f"{parts[0]}-{parts[1]}.{parts[2]}-{parts[3]}"
        elif len(parts) == 3:  # gpt_4o_mini
            return f"{parts[0]}-{parts[1]}-{parts[2]}"
    
    # Default: replace underscores with hyphens
    return config_name.replace('_', '-')

def api_format_to_config_name(api_name: str) -> str:
    """
    Convert API format to config file name.
    Examples:
        gpt-3.5-turbo -> gpt_3_5_turbo
        gpt-4o-mini -> gpt_4o_mini
        human-participant -> human-participant (unchanged)
    """
    if not api_name or api_name == 'human-participant':
        return api_name
    
    # Replace hyphens and dots with underscores
    return api_name.replace('-', '_').replace('.', '_')

def _find_agent_index_by_name(agent_models: list, agent_name: str) -> int:
    """Find agent index by normalized name matching."""
    replace_name_normalized = normalize_model_name(agent_name)
    logger.info(f"Looking for agent: '{agent_name}' (normalized: '{replace_name_normalized}')")
    
    for idx, model_name in enumerate(agent_models):
        model_normalized = normalize_model_name(model_name)
        
        if model_normalized == replace_name_normalized:
            logger.info(f"Found agent '{model_name}' at index {idx}")
            return idx
    
    return None

def _validate_replay_config(original_config: dict, start_from_round: int) -> None:
    """Validate that we have enough information to replay."""
    errors = []
    
    if not original_config:
        errors.append("original_config is empty")
    
    # Check for llm_conf OR metadata
    has_llm_conf = bool(original_config.get("llm_conf"))
    has_metadata = bool(original_config.get("wandb_metadata"))
    
    if not has_llm_conf and not has_metadata:
        errors.append("No llm_conf or wandb_metadata found")
    
    # Check for agent counts
    has_agent_counts = bool(original_config.get("agent_counts"))
    has_metadata_counts = has_metadata and bool(
        original_config.get("wandb_metadata", {}).get("parsed_args", {})
    )
    
    if not has_agent_counts and not has_metadata_counts:
        errors.append("No agent_counts or metadata to derive counts from")
    
    # Check round validity
    num_rounds = original_config.get("num_rounds", 0)
    if start_from_round >= num_rounds:
        errors.append(f"start_from_round ({start_from_round}) >= num_rounds ({num_rounds})")
    
    if errors:
        error_msg = "Replay validation failed:\n" + "\n".join(f"  - {e}" for e in errors)
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    logger.info("✓ Replay config validation passed")

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
                    logger.info(f"Detected human agent at index {idx}")
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
                await store_wandb_metadata(debate_id, enhanced_metadata, hydra_cfg)
            
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
                debate_id, question_data, num_rounds, is_replay=True
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
                        logger.error(f"Timeout waiting for human response in debate {debate_id}")
                    
                    logger.info(f"Calling _run_debate_round for round {round_num}")
                    logger.info(f"Question: {question_text[:100]}")
                    logger.info(f"Skip agent index: {human_agent_index}")
                    logger.info(f"Orchestrator agents: {[a.name for a in orchestrator.agents]}")

                    try:
                        ai_round_result = await orchestrator._run_debate_round(
                            question=question_text,
                            question_prompt=question_prompt,
                            round_number=round_num,
                            skip_agent_index=human_agent_index
                        )
                        logger.info(f"✓ _run_debate_round completed")
                    except Exception as e:
                        logger.error(f"✗ _run_debate_round failed: {e}", exc_info=True)
                        raise
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
                logger.info(f"Deleted RabbitMQ queue for debate {debate_id}")
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
    num_rounds: int,
    is_replay: bool = False
):
    """Create question and question session in database."""
    import hashlib
    
    question_text = question_data.get('question', '')
    correct_answer = question_data.get('answer', '')
    question_prompt = question_data.get('question_prompt')
    
    # For replays, add a timestamp to ensure unique question session
    unique_suffix = f"_replay_{time.time()}" if is_replay else ""
    unique_str = f"{debate_id}_{question_text}_{correct_answer}{unique_suffix}"
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


async def store_wandb_metadata(debate_id: str, enhanced_metadata: dict, hydra_cfg: dict):
    """
    Store enhanced wandb metadata in the database.
    This is a shared function used by both tasks.py and basic_debate.py.
    Now properly tracks human participants as llm configs.
    """
    try:
        llm_configs = enhanced_metadata.get("llm_configs", {})
        agent_models = enhanced_metadata.get("agent_models", [])
        
        logger.info(f"Processing {len(agent_models)} agents: {agent_models}")
        
        parsed_args = {
            "seed": str(hydra_cfg.get("seed", enhanced_metadata.get("seed", 0))),
            "task": enhanced_metadata.get("task", "unknown"),
            "has_custom_questions": enhanced_metadata.get("has_custom_questions", False),
            "debug": False,
            "cost_check": False,
            "experiment.name": hydra_cfg.get("experiment", {}).get("name", enhanced_metadata.get("debate_type", "unnamed")),
            "experiment.num_rounds": enhanced_metadata.get("num_rounds", 2),
            "experiment.num_questions": enhanced_metadata.get("num_questions", 1),
            "total_agents": len(agent_models),
        }
        
        model_counts = {}
        for model in agent_models:
            if model.lower() in ['human-participant', 'human', 'mock/human']:
                normalized = "human-participant"
            else:
                normalized = model
            if normalized not in model_counts:
                model_counts[normalized] = 0
            model_counts[normalized] += 1
        
        llm_idx = 0
        for model_name, count in model_counts.items():
            llm_idx += 1
            if llm_idx <= 3:
                llm_key = f"llm{llm_idx}"
                parsed_args[f"llm_conf@{llm_key}"] = model_name
                parsed_args[f"agent_counts.{llm_idx-1}"] = count
        
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
        logger.info(f"Model counts: {model_counts}")
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