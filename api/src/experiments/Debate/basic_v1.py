import logging
from tqdm import tqdm
import asyncio
from asyncio import Semaphore
import hydra
import uvicorn
from omegaconf import DictConfig, OmegaConf
import wandb
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from typing import List, Type, Dict, Any, Tuple, Union, Optional, Callable, Literal
import os
import shutil
import json
import weakref
import signal

from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
from datetime import datetime, timezone, timedelta
import sys

from src.agents.base_agent import AgentConfig
from src.agents.debate.basic_debate_agent import BasicDebateAgent
from src.llm_api import PromptConfig, LLMConfig
from src.environments.debate.utils import (
    get_question_data,
    load_and_prepare_data,
    save_results,
    log_to_wandb,
    log_single_debate_result,
)
from src.environments.debate.adts import (
    DebateResult,
    DebateRound,
    DebateProcedureResult,
)
from src.environments.debate.checkpointing import (
    ensure_checkpoint_dir,
    checkpoint_exists,
    save_config,
    save_checkpoint,
    load_checkpoint,
)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure loggers to reduce noise
loggers = ["LiteLLM Proxy", "LiteLLM Router", "LiteLLM", "httpx"]
for logger_name in loggers:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.CRITICAL + 1)

_active_semaphores = weakref.WeakSet()
_active_tasks = weakref.WeakSet()
_shutdown_event = asyncio.Event()

class ResourceManager:
    def __init__(self):
        self.semaphores = weakref.WeakSet()
        self.tasks = weakref.WeakSet()
        self.websockets = weakref.WeakSet()
        
    def register_semaphore(self, semaphore):
        self.semaphores.add(semaphore)
        _active_semaphores.add(semaphore)
        
    def register_task(self, task):
        self.tasks.add(task)
        _active_tasks.add(task)
        
    def register_websocket(self, websocket):
        self.websockets.add(websocket)
        
    async def cleanup_all(self):
        logger.info("Starting resource cleanup...")
        
        # Cancel all active tasks
        tasks_to_cancel = list(self.tasks)
        for task in tasks_to_cancel:
            if not task.done():
                task.cancel()
                
        # Wait for tasks to complete/cancel
        if tasks_to_cancel:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tasks_to_cancel, return_exceptions=True),
                    timeout=10.0
                )
            except asyncio.TimeoutError:
                logger.warning("Some tasks did not cancel within timeout")
        
        # Close websockets
        websockets_to_close = list(self.websockets)
        for ws in websockets_to_close:
            try:
                await ws.close()
            except Exception:
                pass
        
        logger.info("Resource cleanup completed")

# Global resource manager
resource_manager = ResourceManager()
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    logger.info("Application starting up")
    
    try:
        yield  # Application runs while inside this block
    finally:
        # Shutdown logic
        logger.info("Application shutting down")
        _shutdown_event.set()
        await resource_manager.cleanup_all()
        if wandb.run is not None:
            wandb.finish()
            
# Create single FastAPI app instance
app = FastAPI(lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for active processes and connections
active_experiments: Dict[str, Dict] = {}
websocket_connections: Dict[str, WebSocket] = {}
experiment_tasks: Dict[str, asyncio.Task] = {}

# Pydantic models
class Agent(BaseModel):
    id: str
    name: str
    model: str
    enabled: bool

class DebateRequest(BaseModel):
    experimentName: str
    totalQuestions: int
    numRounds: int
    seeds: List[int]
    agents: List[Agent]
    selectedDatasets: List[str]
    customQuestions: List[str] = []
    status: str = "pending"
    createdAt: str

class DebateResponse(BaseModel):
    success: bool
    message: str
    experiment_id: str
    websocket_url: Optional[str] = None
    command: Optional[str] = None

class ProgressMessage(BaseModel):
    type: str
    experiment_id: str
    message: str
    progress: Optional[Dict] = None
    timestamp: str
    phase: Optional[str] = None

class ExperimentResponse(BaseModel):
    message: str
    status: str
    experiment_id: Optional[str] = None

class ExperimentRequest(BaseModel):
    config_name: Optional[str] = "basic_debate"
    config_overrides: Optional[Dict[str, Any]] = None

# Custom output handler to capture print statements and progress
class ProgressCapture:
    def __init__(self, experiment_id: str):
        self.experiment_id = experiment_id
        self.original_stdout = sys.stdout
        self.original_stderr = sys.stderr

    async def send_progress(self, message: str, message_type: str = "progress", progress_info: Dict = None):
        websocket = websocket_connections.get(self.experiment_id)
        if websocket:
            try:
                progress_msg = {
                    'type': message_type,
                    'experiment_id': self.experiment_id,
                    'message': message,
                    'progress': progress_info or {},
                    'timestamp': datetime.now().isoformat()
                }
                await websocket.send_text(json.dumps(progress_msg))
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {e}")


def create_managed_semaphore(permits: int) -> asyncio.Semaphore:
    """Create a semaphore and register it for cleanup"""
    semaphore = asyncio.Semaphore(permits)
    resource_manager.register_semaphore(semaphore)
    return semaphore

def create_managed_task(coro) -> asyncio.Task:
    """Create a task and register it for cleanup"""
    task = asyncio.create_task(coro)
    resource_manager.register_task(task)
    
    # Add cleanup callback
    def cleanup_callback(task):
        try:
            # Task is already removed from WeakSet automatically when done
            pass
        except Exception as e:
            logger.warning(f"Error in task cleanup callback: {e}")
    
    task.add_done_callback(cleanup_callback)
    return task

def convert_debate_to_hydra_config(debate_data: DebateRequest) -> List[Dict[str, Any]]:
    """Convert debate request to list of Hydra-style configuration overrides for each dataset-seed combination"""
    enabled_agents = [agent for agent in debate_data.agents if agent.enabled]    
    MAX_AGENTS = 3
    
    agent_counts = [0] * MAX_AGENTS
    for i, agent in enumerate(enabled_agents[:MAX_AGENTS]):
        agent_counts[i] = 1
    
    # Base configuration that's common to all runs
    base_config = {
        "experiment.num_questions": debate_data.totalQuestions,
        "experiment.num_rounds": debate_data.numRounds - 1,
        "experiment.name": debate_data.experimentName,
        "debug": False,
        "cost_check": False,
        "wandb.mode": "disabled",
        "agent_counts": agent_counts
    }
    for i, agent in enumerate(enabled_agents[:MAX_AGENTS]):
        model_name = agent.model.replace('-', '_').replace('/', '_')
        base_config[f"llm_conf@llm{i+1}"] = model_name
    
    config_list = []
    datasets = debate_data.selectedDatasets if debate_data.selectedDatasets else ["gsm8k"]
    seeds = debate_data.seeds if debate_data.seeds else [0]
    
    for dataset in datasets:
        for seed in seeds:
            config = base_config.copy()
            config.update({
                "task": dataset,
                "seed": seed
            })
            config_list.append(config)
    
    return config_list


def parse_progress_info(message: str) -> Dict:
    """Parse progress information from log messages"""
    progress_info = {
        'percentage': None,
        'current_step': None,
        'total_steps': None,
        'phase': None
    }
    
    # Look for tqdm-style progress
    if 'Questions processed:' in message:
        # Extract progress from tqdm output
        import re
        # Pattern: "Questions processed: 50%|██████     | 5/10"
        match = re.search(r'(\d+)%.*?(\d+)/(\d+)', message)
        if match:
            progress_info.update({
                'percentage': int(match.group(1)),
                'current_step': int(match.group(2)),
                'total_steps': int(match.group(3)),
                'phase': 'processing_questions'
            })
    
    # Look for other progress indicators
    if 'Processing question' in message.lower():
        progress_info['phase'] = 'processing_questions'
    elif 'round' in message.lower() and 'debate' in message.lower():
        progress_info['phase'] = 'debate_rounds'
    elif 'initializing' in message.lower():
        progress_info['phase'] = 'initializing'
    elif 'loading' in message.lower():
        progress_info['phase'] = 'loading'
    elif 'saving' in message.lower() or 'checkpoint' in message.lower():
        progress_info['phase'] = 'saving'
    elif 'completed' in message.lower() or 'finished' in message.lower():
        progress_info['phase'] = 'completed'
        progress_info['percentage'] = 100
    
    return progress_info

def create_agent_configs(agent_types):
    """Create a list of agent configs based on agent types and their counts."""
    agent_configs = []
    for agent_type in agent_types:
        for i in range(agent_type.count):
            agent_configs.append(
                {
                    "name": f"{agent_type.name}_{i}",
                    "prompts": agent_type.prompts,
                    "llm_config": agent_type.llm_config,
                }
            )
    return agent_configs


def create_agents(agent_types, num_agents, task_name, debug):
    """Create and initialize agents based on agent types."""
    agent_configs = create_agent_configs(agent_types)
    agents = [
        BasicDebateAgent(
            config=AgentConfig(
                prompt_config=PromptConfig(
                    system_prompt=agent_configs[i]["prompts"]["system_prompt"],
                    partials={
                        **(agent_configs[i]["prompts"]["partials"] or {}),
                        **(agent_configs[i]["prompts"]["additional_partials"] or {}),
                    },
                ),
                llm_config=LLMConfig.from_hydra_config(agent_configs[i]["llm_config"]),
                name=agent_configs[i]["name"],
            ),
            num_agents=num_agents,
            domain=task_name,
            debug=debug,
        )
        for i in range(num_agents)
    ]

    # Check if number of unique agent names matches expected num_agents
    unique_agent_names = set(agent.config.name for agent in agents)
    if len(unique_agent_names) != num_agents:
        raise ValueError(
            f"Expected {num_agents} unique agent names, but got {len(unique_agent_names)}. "
            f"Please check agent configurations for duplicate names: {unique_agent_names}"
        )

    # Build and initialize agents
    for agent in agents:
        agent.build()
        agent.reset()

    return agents


async def run_debate_procedure(
    agents: List[BasicDebateAgent],
    question: str,
    question_prompt: Optional[str],
    num_rounds: int,
    summarize: bool,
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    semaphore: Optional[Semaphore] = None,
) -> DebateProcedureResult:
    """Run a complete debate round for a given question."""
    if _shutdown_event.is_set():
        raise asyncio.CancelledError("Shutdown requested")
    # placeholder to store the debate result
    debate_procedure_result = DebateProcedureResult()

    # Set instruction for all agents
    for agent in agents:
        agent.set_instruction(question)

    # Debate rounds
    for debate in range(num_rounds + 1):
        # Create a new round object
        current_round = DebateRound(round_number=debate)

        if debate != 0:
            # Get responses with semaphore control
            async def add_discussion_with_semaphore(agent):
                async with semaphore:
                    return await agent.add_discussion_with_other_agents_in_context(
                        [a.answer_history[-1] for a in agents if a != agent],
                        summarize=summarize,
                        additional_context=question_prompt
                        if task_name == "math" or task_name == "gsm8k"
                        else None,
                    )

            # Create and run all discussion tasks
            discussion_tasks = [
                add_discussion_with_semaphore(agent) for agent in agents
            ]
            await asyncio.gather(*discussion_tasks)

        # Generate answers with semaphore control
        async def generate_answer_with_semaphore(agent):
            async with semaphore:
                return await agent.generate_answer()

        answer_tasks = [generate_answer_with_semaphore(agent) for agent in agents]
        await asyncio.gather(*answer_tasks)

        # Record the result here
        for agent in agents:
            # current_round.add_query(agent.name, agent.latest_query()) # can add query here
            current_round.add_response(agent.name, agent.latest_response())

        debate_procedure_result.add_round(current_round)

    return debate_procedure_result


async def process_question(
    idx: int,
    question: str,
    answer: Union[str, int],
    question_prompt: Optional[str],
    agent_types,
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    num_rounds: int,
    summarize: bool,
    debug: bool = False,
    semaphore: Optional[Semaphore] = None,
    log_single_results: bool = True,
) -> DebateResult:
    if _shutdown_event.is_set():
        raise asyncio.CancelledError("Shutdown requested")
    # Create new agent instances for this specific question
    num_agents = sum(agent_type.count for agent_type in agent_types)
    agents = create_agents(agent_types, num_agents, task_name, debug)

    # Run debate rounds
    debate_procedure_result = await run_debate_procedure(
        agents, question, question_prompt, num_rounds, summarize, task_name, semaphore
    )

    # Update with question-specific metadata
    debate_result = DebateResult(
        question_id=idx,
        question=question,
        correct_answer=str(answer),
        question_prompt=question_prompt,
        debate_session=debate_procedure_result,
    )

    # Log this debate result to wandb if enabled
    if log_single_results and wandb.run is not None:
        log_single_debate_result(debate_result, task_name, num_rounds)

    return debate_result


def initialize_wandb(cfg: DictConfig, wandb_run_id: Optional[str] = None) -> None:
    """Initialize wandb with proper configuration"""
    # Generate tags for wandb
    llm_keys = [key for key in cfg.keys() if key.startswith("llm")]
    llm_keys.sort()  # Sort to ensure consistent ordering

    # Build model parts dynamically
    model_parts = []
    for i, llm_key in enumerate(llm_keys):
        if i < len(cfg.agent_counts) and cfg.agent_counts[i] > 0:
            model_name = cfg[llm_key].language_models[0].model_name
            count = cfg.agent_counts[i]
            model_parts.append(f"{model_name}_{count}")

    # Create experiment tags
    tags = [
        f"task-{cfg.task.name}",
        f"rounds-{cfg.experiment.num_rounds}",
        f"seed-{cfg.seed}",
        f"name-{cfg.experiment.name}",
    ]

    # Add model tags dynamically
    for i, llm_key in enumerate(llm_keys):
        if i < len(cfg.agent_counts) and cfg.agent_counts[i] > 0:
            model_name = cfg[llm_key].language_models[0].model_name
            count = cfg.agent_counts[i]
            tags.append(f"{model_name}-{count}")

    # Initialize wandb with the run_id if resuming
    wandb.init(
        project=cfg.wandb.project,
        entity=cfg.wandb.team,
        mode=cfg.wandb.mode,
        config=dict(cfg),
        id=wandb_run_id,  # Use the existing run ID if resuming
        resume="must" if wandb_run_id else None,  # Force resume if we have an ID
        tags=tags,
    )


async def run_experiment(cfg: DictConfig):
    # Display config parameters
    # print("\nExperiment Configuration:")
    # print(OmegaConf.to_yaml(OmegaConf.to_container(cfg, resolve=True)))
    # print("\n" + "=" * 50 + "\n")

    # Checkpointing configuration - extract these first
    checkpoint_dir = os.path.join(cfg.exp_dir, "checkpoint")
    resume = cfg.checkpoint.get("resume", False)

    # Ensure checkpoint directory exists
    ensure_checkpoint_dir(checkpoint_dir)

    # If resuming, load the checkpoint and use its config
    if resume and checkpoint_exists(checkpoint_dir):
        print(f"\nResuming experiment from checkpoint: {checkpoint_dir}")
        try:
            simulated_debates, start_idx, loaded_config = load_checkpoint(
                checkpoint_dir
            )

            print(f"Resumed from question index {start_idx}")
            print(f"Loaded {len(simulated_debates)} previously completed debates")

            # Use the loaded config for the experiment parameters
            # This ensures we're using the same parameters as the original run
            cfg = loaded_config
            print("\nUsing loaded configuration from checkpoint:")
            print(OmegaConf.to_yaml(OmegaConf.to_container(cfg, resolve=True)))
            print("\n" + "=" * 50 + "\n")

        except Exception as e:
            print(f"Error loading checkpoint: {e}")
            user_response = input("Start from beginning instead? (yes/no): ").lower()
            if user_response not in ["yes", "y"]:
                print("Experiment cancelled.")
                return
            # Reset to start from beginning
            start_idx = 0
            simulated_debates = []
            resume = False
    else:
        # Not resuming, start fresh
        start_idx = 0
        simulated_debates = []

        # Save initial config
        save_config(checkpoint_dir, cfg)

    task_name = cfg.task.name
    assert task_name in [
        "mmlu",
        "math",
        "commonsense_qa",
        "gsm8k",
    ], "Task domain must be mmlu, math, commonsense_qa, or gsm8k"

    # Get experiment parameters from config
    num_rounds = cfg.experiment.num_rounds
    num_questions = cfg.experiment.num_questions
    summarize = cfg.experiment.summarize
    output_dir = cfg.exp_dir
    log_single_results = cfg.experiment.get(
        "log_single_results", True
    )  # Default to True if not specified

    # Re-extract checkpointing parameters from the config (might have changed if loaded)
    checkpoint_frequency = cfg.checkpoint.get("frequency", 10)

    # Calculate total number of agents from agent types
    num_agents = sum(agent_type.count for agent_type in cfg.agent_types)
    print(f"Total number of agents: {num_agents}")

    # Load and prepare data using shared utility
    questions = load_and_prepare_data(
        task_name=task_name,
        data_path=cfg.task.data_path,
        num_questions=num_questions,
        seed=cfg.seed,
    )

    # Assert that enough questions are loaded
    assert (
        len(questions) >= num_questions
    ), f"Loaded only {len(questions)} questions, but num_questions is set to {num_questions}."

    # Cost checking logic
    if cfg.cost_check:
        print("\nRunning cost check with one question...")

        # Create agents for cost check
        agents = create_agents(cfg.agent_types, num_agents, task_name, cfg.debug)

        # Get first question
        question, answer, question_prompt = get_question_data(questions[0], task_name)

        # Run one complete debate round
        await run_debate_procedure(
            agents,
            question,
            question_prompt,
            num_rounds,
            summarize,
            task_name,
            semaphore=asyncio.Semaphore(
                1
            ),  # use a sequential semaphore for cost estimation
        )

        # Calculate total cost
        total_cost = sum(agent.get_total_cost() for agent in agents)
        estimated_total_cost = total_cost * num_questions

        print(f"\nCost check results for {task_name} task:")
        print(f"Cost for one question: ${total_cost:.4f}")
        print(
            f"Estimated total cost for {num_questions} questions: ${estimated_total_cost:.4f}"
        )

        # Ask for confirmation
        while True:
            response = input(
                "\nDo you want to proceed with the experiment? (yes/no): "
            ).lower()
            if response in ["yes", "y"]:
                break
            elif response in ["no", "n"]:
                print("Experiment cancelled.")
                return
            else:
                print("Please enter 'yes' or 'no'.")

    # Get processing mode, default to concurrent
    processing_mode = cfg.experiment.get("processing_mode", "concurrent")
    # Set key variables based on processing mode
    if processing_mode == "sequential":
        max_concurrent = 1
        semaphore_permits = 1
        concurrent_questions = 1
        print("\nProcessing Strategy: SEQUENTIAL (one at a time)")
    else:  # concurrent mode
        max_concurrent = cfg.experiment.max_concurrent_calls
        semaphore_permits = num_agents
        concurrent_questions = max(1, max_concurrent // semaphore_permits)
        print(
            f"\nProcessing Strategy: CONCURRENT ({concurrent_questions} questions at a time)"
        )

    remaining_questions = num_questions - start_idx
    questions_pbar = tqdm(
        total=remaining_questions, desc="Questions processed", position=0
    )

    # Process questions in batches
    for batch_start in range(start_idx, num_questions, concurrent_questions):
        batch_end = min(batch_start + concurrent_questions, num_questions)
        batch = range(batch_start, batch_end)

        batch_tasks = []
        for idx in batch:
            question, answer, question_prompt = get_question_data(
                questions[idx], task_name
            )
            question_semaphore = create_managed_semaphore(semaphore_permits)

            task = process_question(
                idx=idx,
                question=question,
                answer=answer,
                question_prompt=question_prompt,
                agent_types=cfg.agent_types,
                task_name=task_name,
                num_rounds=num_rounds,
                summarize=summarize,
                debug=cfg.debug,
                semaphore=question_semaphore,
                log_single_results=log_single_results,
            )
            batch_tasks.append(task)

        batch_results = await asyncio.gather(*batch_tasks)
        simulated_debates.extend(batch_results)
        questions_pbar.update(len(batch_results))

        # Save checkpoint after processing this batch
        # Find the last index in this batch that should trigger a checkpoint
        last_checkpoint_idx = None
        for checkpoint_idx in range(batch_start, batch_end):
            if (
                checkpoint_idx > 0  # Skip the first question (index 0)
                and (
                    checkpoint_idx % checkpoint_frequency == 0
                    or checkpoint_idx == num_questions - 1
                )
            ):
                last_checkpoint_idx = checkpoint_idx

        # Save at the latest checkpoint opportunity in this batch
        if last_checkpoint_idx is not None:
            next_question_idx = last_checkpoint_idx + 1
            save_checkpoint(
                simulated_debates,
                next_question_idx,
                cfg,
                checkpoint_dir,
            )
            print(f"Checkpoint saved at question {next_question_idx}/{num_questions}")

    questions_pbar.close()

    # Save results and get file paths using shared utility
    output_file, performance_file = save_results(
        generated_results=simulated_debates,
        output_dir=output_dir,
        task_name=task_name,  # Use original task name WITHOUT seed
        num_rounds=num_rounds,
        seed=cfg.seed,  # Pass the seed parameter
        strict=cfg.get("strict", False),
    )

    # For wandb logging, you can still use the version with seed if needed
    task_name_with_seed = f"{task_name}_seed{cfg.seed}"
    
    # Log to wandb using shared utility (only if wandb is initialized)
    if wandb.run is not None:
        log_to_wandb(
            generated_results=simulated_debates,
            task_name=task_name_with_seed,  # Use modified task name with seed for wandb
            num_rounds=num_rounds,
            output_file=output_file,
            performance_file=performance_file,
            strict=cfg.get("strict", False),
        )

    # Copy final results to checkpoint directory - use seed-specific names
    base_filename = f"{task_name}_seed{cfg.seed}"
    shutil.copy(output_file, os.path.join(checkpoint_dir, f"{base_filename}_result.json"))
    shutil.copy(
        performance_file,
        os.path.join(checkpoint_dir, f"{base_filename}_performance.json"),
    )
    print(f"\nExperiment completed and saved to checkpoint: {checkpoint_dir}")


def load_hydra_config(config_name: str = "basic_debate", overrides: Optional[List[str]] = None):
    """Load Hydra configuration programmatically"""
    from hydra import compose, initialize
    from hydra.core.global_hydra import GlobalHydra
    import os
    from datetime import datetime
    
    # Ensure clean Hydra state
    GlobalHydra.instance().clear()
    
    # Change working directory to the script's directory temporarily
    current_dir = os.path.dirname(os.path.abspath(__file__))
    original_cwd = os.getcwd()
    
    try:
        os.chdir(current_dir)
        
        # Add default exp_dir override if not provided
        default_overrides = []
        if overrides:
            default_overrides.extend(overrides)
        
        # CRITICAL FIX: Check if exp_dir is already in overrides and DON'T override it
        has_exp_dir = any(override.startswith('exp_dir=') for override in default_overrides)
        if not has_exp_dir:
            # Only create a default exp_dir if one wasn't already provided
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            default_exp_dir = f"./outputs/{timestamp}"
            default_overrides.append(f"exp_dir={default_exp_dir}")
            logger.info(f"No exp_dir provided, using default: {default_exp_dir}")
        else:
            # Log the provided exp_dir
            exp_dir_override = next(o for o in default_overrides if o.startswith('exp_dir='))
            logger.info(f"Using provided exp_dir: {exp_dir_override}")
        
        with initialize(version_base=None, config_path="../conf"):
            cfg = compose(config_name=config_name, overrides=default_overrides)
        return cfg
    finally:
        # Always restore original working directory
        os.chdir(original_cwd)

async def run_experiment_with_config(config_name: str = "basic_debate", config_overrides: Optional[Dict[str, Any]] = None):
    """Run the experiment with the given configuration"""
    # Convert dict overrides to hydra override strings if provided
    overrides = []
    if config_overrides:
        for key, value in config_overrides.items():
            overrides.append(f"{key}={value}")
    
    # Load configuration
    cfg = load_hydra_config(config_name, overrides)
    
    # Check if resuming from checkpoint
    checkpoint_dir = os.path.join(cfg.exp_dir, "checkpoint")
    resume = cfg.checkpoint.get("resume", False)

    # Initialize wandb run ID from checkpoint if resuming
    wandb_run_id = None
    if resume and checkpoint_exists(checkpoint_dir):
        # Try to load wandb ID from checkpoint
        try:
            wandb_metadata_file = os.path.join(checkpoint_dir, "wandb_metadata.json")
            if os.path.exists(wandb_metadata_file):
                with open(wandb_metadata_file, "r") as f:
                    wandb_metadata = json.load(f)
                    wandb_run_id = wandb_metadata.get("run_id")
                    print(f"Resuming wandb run: {wandb_run_id}")
        except Exception as e:
            print(f"Error loading wandb metadata: {e}")

    # **INITIALIZE WANDB EARLY - BEFORE ANY EXPERIMENTS RUN**
    initialize_wandb(cfg, wandb_run_id)

    # Save the wandb run ID to checkpoint for future resuming
    if not resume or not wandb_run_id:
        # Only save if we're not resuming or if we didn't find a previous ID
        wandb_metadata_file = os.path.join(checkpoint_dir, "wandb_metadata.json")
        os.makedirs(os.path.dirname(wandb_metadata_file), exist_ok=True)
        with open(wandb_metadata_file, "w") as f:
            json.dump({"run_id": wandb.run.id}, f)

    # Generate experiment identifier for return value
    model_parts = []
    llm_keys = [key for key in cfg.keys() if key.startswith("llm")]
    llm_keys.sort()
    
    for i, llm_key in enumerate(llm_keys):
        if i < len(cfg.agent_counts) and cfg.agent_counts[i] > 0:
            model_name = cfg[llm_key].language_models[0].model_name
            count = cfg.agent_counts[i]
            model_parts.append(f"{model_name}_{count}")

    models_str = "-".join(model_parts)
    experiment_id = f"{cfg.task.name}_r{cfg.experiment.num_rounds}_{models_str}_s{cfg.seed}"

    try:
        # Run the actual experiment
        await run_experiment(cfg)
        return experiment_id
    finally:
        # Always finish wandb run, even if experiment fails
        if wandb.run is not None:
            wandb.finish()

async def run_experiment_with_progress(experiment_id: str, config_overrides_list: List[Dict[str, Any]]):
    """Run multiple experiments with progress tracking for each dataset-seed combination"""
    progress_capture = ProgressCapture(experiment_id)
    
    try:
        total_runs = len(config_overrides_list)
        completed_runs = 0
        
        shared_exp_dir = f"./outputs/{experiment_id}"
        
        # Send initial status
        await progress_capture.send_progress(f"Initializing {total_runs} experiment runs in {shared_exp_dir}...", "status")
        
        results = []
        
        # Update all configs to use the shared directory
        for config in config_overrides_list:
            config['exp_dir'] = shared_exp_dir
        
        # Update the experiment info with the shared directory
        if experiment_id in active_experiments:
            active_experiments[experiment_id]['exp_dir'] = shared_exp_dir
        
        # Run each configuration
        for i, config_overrides in enumerate(config_overrides_list, 1):
            dataset = config_overrides.get('task', 'unknown')
            seed = config_overrides.get('seed', 'unknown')
            
            # Send progress update
            await progress_capture.send_progress(
                f"Running experiment {i}/{total_runs}: {dataset} with seed {seed}",
                "progress",
                {
                    'current_run': i,
                    'total_runs': total_runs,
                    'percentage': int((i-1) / total_runs * 100),
                    'current_dataset': dataset,
                    'current_seed': seed
                }
            )
            
            # Run the experiment
            result = await run_experiment_with_config(
                config_name="basic_debate",
                config_overrides=config_overrides
            )
            
            results.append({
                'dataset': dataset,
                'seed': seed,
                'result': result
            })
            
            completed_runs += 1
            
            # Send completion update for this run
            await progress_capture.send_progress(
                f"Completed {completed_runs}/{total_runs}: {dataset} with seed {seed}",
                "progress",
                {
                    'current_run': completed_runs,
                    'total_runs': total_runs,
                    'percentage': int(completed_runs / total_runs * 100),
                    'completed_dataset': dataset,
                    'completed_seed': seed
                }
            )
        
        # Send final completion message
        await progress_capture.send_progress("All experiments completed successfully!", "completion", {
            'total_runs': total_runs,
            'completed_runs': completed_runs,
            'percentage': 100
        })
        
        # Update experiment status
        if experiment_id in active_experiments:
            active_experiments[experiment_id].update({
                'status': 'completed',
                'results': results,
                'end_time': datetime.now(),
                'exp_dir': shared_exp_dir
            })
        
        return results
        
    except Exception as e:
        logger.error(f"Experiment {experiment_id} failed: {e}")
        await progress_capture.send_progress(f"Experiment failed: {str(e)}", "error")
        
        # Update experiment status
        if experiment_id in active_experiments:
            active_experiments[experiment_id].update({
                'status': 'failed',
                'error': str(e),
                'end_time': datetime.now()
            })
        
        raise e
    
@app.post("/api/debate/queue")
async def queue_debate(debate_data: DebateRequest, auto_start: bool = True):
    experiment_id = str(uuid.uuid4())    
    shared_exp_dir = f"./outputs/{experiment_id}"    
    config_overrides_list = convert_debate_to_hydra_config(debate_data)    
    for config in config_overrides_list:
        config['exp_dir'] = shared_exp_dir
    
    total_runs = len(config_overrides_list)
    datasets = list(set(config['task'] for config in config_overrides_list))
    seeds = list(set(config['seed'] for config in config_overrides_list))
    
    active_experiments[experiment_id] = {
        "debate_data": debate_data.dict(),
        "datasets": datasets,
        "seeds": seeds,
        "config_overrides_list": config_overrides_list,
        "total_runs": total_runs,
        "status": "queued",
        "created_at": datetime.now(),
        "experiment_id": experiment_id,
        "exp_dir": shared_exp_dir
    }
    
    logger.info(f"Queued experiment {experiment_id} with {total_runs} runs: datasets={datasets}, seeds={seeds}")    
    logger.info(f"Shared output directory: {shared_exp_dir}")

    if auto_start:
        logger.info(f"Auto-starting execution for experiment {experiment_id}")
        create_managed_task(run_experiment_by_id(experiment_id))
        status_message = f"Experiment queued and started successfully ({total_runs} runs: {len(datasets)} datasets × {len(seeds)} seeds)"
    else:
        status_message = f"Experiment queued successfully - {total_runs} runs planned - call /execute to start"
    
    return DebateResponse(
        success=True,
        experiment_id=experiment_id,
        websocket_url=f"ws://localhost:8001/ws/debate/{experiment_id}",
        message=status_message
    )

@app.post("/api/debate/{experiment_id}/execute")
async def execute_experiment(experiment_id: str):
    if experiment_id in experiment_tasks and not experiment_tasks[experiment_id].done():
        raise HTTPException(status_code=400, detail="Experiment task is already running")

    # Start the task
    task = asyncio.create_task(run_experiment_by_id(experiment_id))
    experiment_tasks[experiment_id] = task

    # Cleanup
    task.add_done_callback(lambda t: experiment_tasks.pop(experiment_id, None))

    return DebateResponse(
        success=True,
        message="Experiment execution started",
        experiment_id=experiment_id,
        command="execute"
    )

async def run_experiment_by_id(experiment_id: str):
    """Run an experiment by ID (used by queue or explicit execution)"""
    if experiment_id not in active_experiments:
        raise ValueError("Experiment not found")

    experiment_info = active_experiments[experiment_id]

    # Skip if already running or completed
    if experiment_info.get('status') in ('running', 'completed'):
        return

    active_experiments[experiment_id]['status'] = 'running'
    active_experiments[experiment_id]['start_time'] = datetime.now()

    try:
        # Use the list of configurations instead of a single one
        results = await run_experiment_with_progress(
            experiment_id=experiment_id,
            config_overrides_list=experiment_info['config_overrides_list']
        )

        active_experiments[experiment_id].update({
            'status': 'completed',
            'results': results,
            'end_time': datetime.now()
        })

        logger.info(f"Experiment {experiment_id} completed successfully with {len(results)} runs")
        return results

    except Exception as e:
        active_experiments[experiment_id].update({
            'status': 'failed',
            'error': str(e),
            'end_time': datetime.now()
        })
        logger.error(f"Experiment {experiment_id} failed: {e}")
        raise e

@app.websocket("/ws/debate/{experiment_id}")
async def websocket_experiment_progress(websocket: WebSocket, experiment_id: str):
    """WebSocket endpoint for real-time experiment progress - MONITORING ONLY"""
    await websocket.accept()
    websocket_connections[experiment_id] = websocket
    resource_manager.register_websocket(websocket)
    
    try:
        if experiment_id not in active_experiments:
            await websocket.send_text(json.dumps({
                'type': 'error',
                'message': 'Experiment not found',
                'timestamp': datetime.now().isoformat()
            }))
            return
        
        # Send initial connection message
        await websocket.send_text(json.dumps({
            'type': 'status',
            'message': 'Connected to experiment monitoring',
            'experiment_id': experiment_id,
            'status': active_experiments[experiment_id].get('status', 'unknown'),
            'timestamp': datetime.now().isoformat()
        }))
        
        experiment_info = active_experiments[experiment_id]
        
        current_status = experiment_info.get('status', 'unknown')
        
        if current_status == 'queued':
            await websocket.send_text(json.dumps({
                'type': 'status',
                'message': 'Experiment is queued.',
                'experiment_id': experiment_id,
                'status': 'queued',
                'timestamp': datetime.now().isoformat()
            }))
        elif current_status == 'running':
            await websocket.send_text(json.dumps({
                'type': 'status',
                'message': 'Experiment is currently running',
                'experiment_id': experiment_id,
                'status': 'running',
                'timestamp': datetime.now().isoformat()
            }))
        elif current_status == 'completed':
            await websocket.send_text(json.dumps({
                'type': 'completion',
                'message': 'Experiment completed. Return to dashboard to view this experiment.',
                'experiment_id': experiment_id,
                'status': 'completed',
                'timestamp': datetime.now().isoformat()
            }))
        elif current_status == 'failed':
            await websocket.send_text(json.dumps({
                'type': 'error',
                'message': f"Experiment failed: {experiment_info.get('error', 'Unknown error')}",
                'experiment_id': experiment_id,
                'status': 'failed',
                'timestamp': datetime.now().isoformat()
            }))
  
        try:
            while True:
                message = await websocket.receive_text()
        except WebSocketDisconnect:
            logger.info(f"WebSocket client disconnected for experiment {experiment_id}")
        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for experiment {experiment_id}")
    except Exception as e:
        logger.error(f"WebSocket error for experiment {experiment_id}: {e}")
        try:
            await websocket.send_text(json.dumps({
                'type': 'error',
                'message': f'WebSocket error: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }))
        except:
            pass
    finally:
        if experiment_id in websocket_connections:
            del websocket_connections[experiment_id]

@app.get("/api/debate/{experiment_id}/status")
async def get_experiment_status(experiment_id: str):
    if experiment_id not in active_experiments:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    experiment_info = active_experiments[experiment_id]
    return {
        'experiment_id': experiment_id,
        'status': experiment_info['status'],
        'start_time': experiment_info.get('start_time'),
        'end_time': experiment_info.get('end_time'),
        'total_runs': experiment_info.get('total_runs', 1),
        'datasets': experiment_info.get('datasets', []),
        'seeds': experiment_info.get('seeds', []),
        'config_overrides_list': experiment_info.get('config_overrides_list', [])
    }

def get_closest_output_dir(base="./outputs"):
    now = datetime.now(timezone.utc)
    candidates = []
    for name in os.listdir(base):
        folder_path = os.path.join(base, name)
        if os.path.isdir(folder_path):
            try:
                dt = datetime.strptime(name, "%Y-%m-%d_%H-%M-%S").replace(tzinfo=timezone.utc)
                candidates.append((dt, folder_path))
            except ValueError:
                continue

    if not candidates:
        timestamp = now.strftime("%Y-%m-%d_%H-%M-%S")
        output_dir = os.path.join(base, timestamp)
        os.makedirs(output_dir, exist_ok=True)
        return output_dir

    closest = min(candidates, key=lambda x: abs(x[0] - now))
    return closest[1]

def find_experiment_directories(experiment_id: str, experiment_start_time: datetime, base_dir: str = './outputs'):
    """Find all timestamped directories that belong to this experiment"""
    experiment_dirs = []
    
    if not os.path.exists(base_dir):
        return experiment_dirs
    
    # Convert experiment start time to a reasonable search window
    start_window = experiment_start_time - timedelta(minutes=5)  # 5 minutes before
    end_window = experiment_start_time + timedelta(hours=2)     # 2 hours after (generous buffer)
    
    for item in os.listdir(base_dir):
        item_path = os.path.join(base_dir, item)
        if not os.path.isdir(item_path):
            continue
        
        try:
            # Parse timestamp from directory name (format: YYYY-MM-DD_HH-MM-SS)
            if len(item) == 19 and item[4] == '-' and item[7] == '-' and item[13] == '-':
                dir_time = datetime.strptime(item, "%Y-%m-%d_%H-%M-%S")
                
                # Check if this directory was created in our time window
                if start_window <= dir_time <= end_window:
                    experiment_dirs.append(item_path)
                    logger.info(f"Found experiment directory: {item_path} (created: {dir_time})")
                    
        except ValueError:
            # Not a valid timestamp format, skip
            continue
    
    # Sort by timestamp
    experiment_dirs.sort()
    logger.info(f"Found {len(experiment_dirs)} directories for experiment {experiment_id}")
    return experiment_dirs

@app.get("/api/debate/{experiment_id}/results")
async def get_experiment_results(experiment_id: str):
    """Get results of completed experiment - handles multiple dataset-seed combinations"""
    try:
        if experiment_id not in active_experiments:
            raise HTTPException(status_code=404, detail="Experiment not found")
        
        experiment_info = active_experiments[experiment_id]
        
        if experiment_info['status'] != 'completed':
            raise HTTPException(status_code=400, detail="Experiment not completed yet")
        
        # Get experiment metadata
        config_overrides_list = experiment_info.get('config_overrides_list', [])
        experiment_start_time = experiment_info.get('start_time', datetime.now())
        
        # Find directories that belong to this experiment
        experiment_dirs = find_experiment_directories(
            experiment_id, 
            experiment_start_time,
            './outputs'
        )
        
        if not experiment_dirs:
            logger.warning(f"No experiment directories found for {experiment_id}")
            # Fallback to the stored exp_dir
            output_dir = experiment_info.get("exp_dir")
            if output_dir and os.path.exists(output_dir):
                experiment_dirs = [output_dir]
            else:
                experiment_dirs = [get_closest_output_dir()]
        
        logger.info(f"Searching {len(experiment_dirs)} directories for results")
        
        # Structure results by combination, each with its own metadata
        runs_data = {}
        
        # Build the actual combinations that were run
        for config in config_overrides_list:
            dataset = config.get('task', 'unknown')
            seed = config.get('seed', 0)
            combo_key = f"{dataset}_seed{seed}"
            
            # Initialize run data structure
            runs_data[combo_key] = {
                'resultData': None,
                'performanceData': None,
                'wandbMetadata': {
                    'startedAt': experiment_start_time.isoformat() if experiment_start_time else datetime.now().isoformat(),
                    'parsed_args': [config],
                }
            }
            
            # Search across all experiment directories for this combination
            result_data = None
            performance_data = None
            
            for experiment_dir in experiment_dirs:
                # Look for files with the seed-specific naming pattern
                possible_result_paths = [
                    f"{experiment_dir}/{combo_key}_result.json",  # Try with seed first
                    f"{experiment_dir}/{dataset}_result.json",    # Fallback to dataset only
                    f"{experiment_dir}/checkpoint/{combo_key}_result.json",
                    f"{experiment_dir}/checkpoint/{dataset}_result.json"
                ]
                
                possible_performance_paths = [
                    f"{experiment_dir}/{combo_key}_performance.json",
                    f"{experiment_dir}/{dataset}_performance.json", 
                    f"{experiment_dir}/checkpoint/{combo_key}_performance.json",
                    f"{experiment_dir}/checkpoint/{dataset}_performance.json"
                ]
                
                # Look for result file
                for result_path in possible_result_paths:
                    if os.path.exists(result_path):
                        try:
                            logger.info(f"Found result file: {result_path}")
                            with open(result_path, "r") as f:
                                result_data = json.load(f)
                            break
                        except Exception as e:
                            logger.warning(f"Error reading results from {result_path}: {e}")
                            continue
                
                # Look for performance file in the same directory if we found results
                if result_data is not None:
                    for performance_path in possible_performance_paths:
                        if os.path.exists(performance_path):
                            try:
                                logger.info(f"Found performance file: {performance_path}")
                                with open(performance_path, "r") as f:
                                    performance_data = json.load(f)
                                break
                            except Exception as e:
                                logger.warning(f"Error reading performance from {performance_path}: {e}")
                                continue
                    break  # Found data for this combo, move to next config
            
            # Store the data if found
            runs_data[combo_key]['resultData'] = result_data or {}
            runs_data[combo_key]['performanceData'] = performance_data or {}
            
            if result_data is not None:
                logger.info(f"Stored result data for {combo_key}")
            else:
                logger.warning(f"No result data found for {combo_key}")
        
        # Structure the response based on number of runs
        if len(config_overrides_list) == 1:
            # Single run - maintain backward compatibility
            combo_key = list(runs_data.keys())[0]
            single_run = runs_data[combo_key]
            
            response_data = {
                'experiment_id': experiment_id,
                'status': 'completed',
                'resultData': single_run['resultData'],
                'performanceData': single_run['performanceData'],
                'wandbMetadata': single_run['wandbMetadata'],
                'message': 'Results loaded successfully' if single_run['resultData'] else 'Experiment completed but no results files found'
            }
        else:
            response_data = {
                'experiment_id': experiment_id,
                'status': 'completed',
                'runs': runs_data,
                'summary': {
                    'total_runs': len(config_overrides_list),
                    'datasets': list(set(config.get('task') for config in config_overrides_list)),
                    'seeds': list(set(config.get('seed') for config in config_overrides_list)),
                    'combinations': list(runs_data.keys()),
                    'directories_scanned': experiment_dirs,
                    'successful_runs': len([r for r in runs_data.values() if r['resultData']]),
                    'experiment_started_at': experiment_start_time.isoformat() if experiment_start_time else datetime.now().isoformat()
                },
                'message': f'Results loaded for {len([r for r in runs_data.values() if r["resultData"]])} out of {len(runs_data)} runs'
            }
        
        logger.info(f"Returning response with {len(runs_data)} run combinations")
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_experiment_results for {experiment_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    
@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

if __name__ == "__main__":
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}, setting shutdown event")
        _shutdown_event.set()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    uvicorn.run(
        "basic_debate:app",
        host="0.0.0.0",
        port=8001,
        reload=False
    )