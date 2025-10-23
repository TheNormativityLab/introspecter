import logging
from tqdm import tqdm
import asyncio
from asyncio import Semaphore
import hydra
from omegaconf import DictConfig, OmegaConf
import wandb
from dotenv import load_dotenv
from typing import List, Optional, Literal, Dict
import uuid
from datetime import datetime
import time
from collections import Counter

from src.agents.base_agent import AgentConfig
from src.agents.debate.basic_debate_agent import BasicDebateAgent
from src.llm_api import PromptConfig, LLMConfig
from src.environments.debate.utils import (
    get_question_data,
    load_and_prepare_data,
)
from src.environments.debate.adts import (
    DebateResult,
    DebateRound,
    DebateProcedureResult,
)

# Import database modules
from src.database.database import DatabaseManager
from src.database.repository import DebateRepository

# Configure loggers
loggers = ["LiteLLM Proxy", "LiteLLM Router", "LiteLLM", "httpx"]
for logger_name in loggers:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.CRITICAL + 1)


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
    debate_procedure_result = DebateProcedureResult()
    for agent in agents:
        agent.set_instruction(question)
    for debate in range(num_rounds):
        current_round = DebateRound(round_number=debate)

        if debate != 0:
            async def add_discussion_with_semaphore(agent):
                async with semaphore:
                    return await agent.add_discussion_with_other_agents_in_context(
                        [a.answer_history[-1] for a in agents if a != agent],
                        summarize=summarize,
                        additional_context=question_prompt
                        if task_name == "math" or task_name == "gsm8k"
                        else None,
                    )

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

        # Record the result
        for agent in agents:
            current_round.add_response(agent.name, agent.latest_response())

        debate_procedure_result.add_round(current_round)

    return debate_procedure_result


async def process_and_store_question(
    idx: int,
    question: str,
    answer: str,
    question_prompt: Optional[str],
    agent_types,
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    num_rounds: int,
    summarize: bool,
    debate_id: uuid.UUID,
    db_manager: DatabaseManager,
    debug: bool = False,
    semaphore: Optional[Semaphore] = None,
) -> DebateResult:
    """Process a question and store results in database."""
    start_time = time.time()
    
    num_agents = sum(agent_type.count for agent_type in agent_types)
    agents = create_agents(agent_types, num_agents, task_name, debug)

    debate_procedure_result = await run_debate_procedure(
        agents, question, question_prompt, num_rounds, summarize, task_name, semaphore
    )

    try:
        async with db_manager.get_session() as session:
            repo = DebateRepository(session)
            
            # Get or create question
            question_obj = await repo.get_or_create_question(
                question_id=idx,
                question_text=question,
                correct_answer=str(answer),
                question_prompt=question_prompt
            )
            
            # Create question session
            question_session = await repo.create_question_session(
                debate_id=debate_id,
                question_id=question_obj.id,
                total_rounds=num_rounds
            )
            
            # Pre-extract all answers to avoid redundant extractions
            extracted_answers_cache: Dict[str, Optional[str]] = {}
            for round_data in debate_procedure_result.rounds:
                for agent in agents:
                    agent_name = agent.config.name
                    if agent_name in round_data.responses:
                        response = round_data.responses[agent_name]
                        cache_key = f"{round_data.round_number}_{agent_name}"
                        if cache_key not in extracted_answers_cache:
                            extracted = await agent.extract_answer_from_response(response)
                            extracted_answers_cache[cache_key] = extracted
            
            # Store rounds and responses
            for round_data in debate_procedure_result.rounds:
                round_number = round_data.round_number
                
                # Calculate majority vote for this round
                agent_answers = []
                for agent in agents:
                    agent_name = agent.config.name
                    if agent_name in round_data.responses:
                        cache_key = f"{round_number}_{agent_name}"
                        extracted = extracted_answers_cache.get(cache_key)
                        if extracted:
                            agent_answers.append(extracted)
                
                if agent_answers:
                    most_common_count = Counter(agent_answers).most_common(1)[0][1]
                    majority_vote = most_common_count / len(agent_answers)
                else:
                    majority_vote = 0.0
                
                # Create round with majority_vote
                round_obj = await repo.create_round(
                    question_session_id=question_session.id,
                    round_number=round_number,
                    majority_vote=majority_vote
                )
                
                # Create agent responses
                for agent_idx, agent in enumerate(agents):
                    agent_name = agent.config.name
                    if agent_name in round_data.responses:
                        response_text = round_data.responses[agent_name]
                        cache_key = f"{round_number}_{agent_name}"
                        extracted_answer = extracted_answers_cache.get(cache_key)
                        is_correct = extracted_answer == str(answer) if extracted_answer else None
                        await repo.create_agent_response(
                            round_id=round_obj.id,
                            agent_index=agent_idx,
                            response_text=response_text,
                            extracted_answer=extracted_answer,
                            is_correct=is_correct,
                            model_name=agent_name.split("_agent")[0]
                        )
            
            # Complete question session
            await repo.complete_question_session(
                session_id=question_session.id,
            )
            
            # Update debate progress
            await repo.update_debate_progress(
                debate_id=debate_id,
                completed_questions=idx + 1
            )
    
    except Exception as e:
        logging.error(f"Error storing question {idx} to database: {e}")
        raise
    
    # Calculate final answer for return object
    final_answers = []
    if debate_procedure_result.rounds:
        final_round = debate_procedure_result.rounds[-1]
        for agent in agents:
            agent_name = agent.config.name
            if agent_name in final_round.responses:
                cache_key = f"{final_round.round_number}_{agent_name}"
                extracted = extracted_answers_cache.get(cache_key)
                if extracted:
                    final_answers.append(extracted)
    
    debate_result = DebateResult(
        question_id=idx,
        question=question,
        correct_answer=str(answer),
        question_prompt=question_prompt,
        debate_session=debate_procedure_result,
    )
    
    return debate_result


async def run_experiment(cfg: DictConfig):
    """Run experiment with database storage."""    
    db_manager = DatabaseManager()
    await db_manager.create_tables()
    
    task_name = cfg.task.name
    assert task_name in [
        "mmlu",
        "math",
        "commonsense_qa",
        "gsm8k",
    ], "Task domain must be mmlu, math, commonsense_qa, or gsm8k"

    num_rounds = cfg.experiment.num_rounds
    num_questions = cfg.experiment.num_questions
    summarize = cfg.experiment.summarize    
    num_agents = sum(agent_type.count for agent_type in cfg.agent_types)

    cfg_dict = OmegaConf.to_container(cfg, resolve=True)
    parsed_args = {
        "seed": cfg_dict.get("seed", 0),
        "task": cfg_dict.get("task", {}).get("name", None),
        "debug": cfg_dict.get("debug", False),
        "cost_check": cfg_dict.get("cost_check", False),
        "experiment.name": cfg_dict.get("experiment", {}).get("name", ""),
        "checkpoint.frequency": cfg_dict.get("checkpoint", {}).get("frequency", 25),
        "experiment.num_rounds": cfg_dict.get("experiment", {}).get("num_rounds", 1),
        "experiment.num_questions": cfg_dict.get("experiment", {}).get("num_questions", 1),
        "experiment.max_concurrent_calls": cfg_dict.get("experiment", {}).get("max_concurrent_calls", 10),
    }

    agent_counts = cfg_dict.get("agent_counts", [])
    for i in range(len(agent_counts)):
        parsed_args[f"agent_counts.{i}"] = agent_counts[i]

    for i in range(max(2, len(agent_counts))):
        llm_key = f"llm{i+1}"
        parsed_args[f"llm_conf@{llm_key}"] = agent_counts[i] if i < len(agent_counts) else 0

    llm_configs = []
    llm_keys = [key for key in cfg.keys() if key.startswith("llm")]
    llm_keys.sort()
    for llm_key in llm_keys:
        llm_config_dict = OmegaConf.to_container(cfg[llm_key], resolve=True)
        llm_configs.append(llm_config_dict)

    output = {
        "startedAt": datetime.utcnow().isoformat() + "Z",
        "llm_configs": llm_configs,
        "parsed_args": parsed_args
    }
    questions = load_and_prepare_data(
        task_name=task_name,
        data_path=cfg.task.data_path,
        num_questions=num_questions,
        seed=cfg.seed,
    )
    
    assert (
        len(questions) >= num_questions
    ), f"Loaded only {len(questions)} questions, but num_questions is set to {num_questions}."

    if cfg.cost_check:
        print("\nRunning cost check with one question...")
        agents = create_agents(cfg.agent_types, num_agents, task_name, cfg.debug)
        question, answer, question_prompt = get_question_data(questions[0], task_name)

        await run_debate_procedure(
            agents,
            question,
            question_prompt,
            num_rounds,
            summarize,
            task_name,
            semaphore=asyncio.Semaphore(1),
        )

        total_cost = sum(agent.get_total_cost() for agent in agents)
        estimated_total_cost = total_cost * num_questions

        print(f"\nCost check results for {task_name} task:")
        print(f"Cost for one question: ${total_cost:.4f}")
        print(f"Estimated total cost for {num_questions} questions: ${estimated_total_cost:.4f}")

        while True:
            response = input("\nDo you want to proceed with the experiment? (yes/no): ").lower()
            if response in ["yes", "y"]:
                break
            elif response in ["no", "n"]:
                print("Experiment cancelled.")
                await db_manager.close()
                return
            else:
                print("Please enter 'yes' or 'no'.")

    processing_mode = cfg.experiment.get("processing_mode", "concurrent")
    if processing_mode == "sequential":
        max_concurrent = 1
        semaphore_permits = 1
        concurrent_questions = 1
        print("\nProcessing Strategy: SEQUENTIAL (one at a time)")
    else:
        max_concurrent = cfg.experiment.max_concurrent_calls
        semaphore_permits = num_agents
        concurrent_questions = max(1, max_concurrent // semaphore_permits)
        print(f"\nProcessing Strategy: CONCURRENT ({concurrent_questions} questions at a time)")

    async with db_manager.get_session() as session:
        repo = DebateRepository(session)
        
        model_parts = []
        llm_keys = [key for key in cfg.keys() if key.startswith("llm")]
        llm_keys.sort()
        
        for i, llm_key in enumerate(llm_keys):
            if i < len(cfg.agent_counts) and cfg.agent_counts[i] > 0:
                model_name = cfg[llm_key].language_models[0].model_name
                count = cfg.agent_counts[i]
                model_parts.append(f"{model_name}_{count}")
        
        debate = await repo.create_debate(
            name=cfg.experiment.get("name", "basic_debate"),
            debate_type="basic_debate",
            config=output,
            total_questions=num_questions
        )
        debate_id = debate.id
        print(f"\nCreated debate record: {debate_id}")

    questions_pbar = tqdm(total=num_questions, desc="Questions processed", position=0)

    for batch_start in range(0, num_questions, concurrent_questions):
        batch_end = min(batch_start + concurrent_questions, num_questions)
        batch = range(batch_start, batch_end)

        batch_tasks = []
        for idx in batch:
            question, answer, question_prompt = get_question_data(questions[idx], task_name)
            question_semaphore = asyncio.Semaphore(semaphore_permits)

            task = process_and_store_question(
                idx=idx,
                question=question,
                answer=answer,
                question_prompt=question_prompt,
                agent_types=cfg.agent_types,
                task_name=task_name,
                num_rounds=num_rounds,
                summarize=summarize,
                debate_id=debate_id,
                db_manager=db_manager,
                debug=cfg.debug,
                semaphore=question_semaphore,
            )
            batch_tasks.append(task)

        batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
        
        # Handle any exceptions
        for i, result in enumerate(batch_results):
            if isinstance(result, Exception):
                logging.error(f"Error processing question {batch_start + i}: {result}")
        
        questions_pbar.update(len(batch_results))

    questions_pbar.close()
    
    # Mark debate as completed
    async with db_manager.get_session() as session:
        repo = DebateRepository(session)
        await repo.complete_debate(debate_id)
    
    print(f"\nExperiment completed! Debate ID: {debate_id}")
    await db_manager.close()


load_dotenv()


@hydra.main(
    version_base=None,
    config_path="../conf",
    config_name="basic_debate",
)
def main(cfg: DictConfig):
    tags = [
        f"task-{cfg.task.name}",
        f"rounds-{cfg.experiment.num_rounds}",
        f"seed-{cfg.seed}",
        f"name-{cfg.experiment.name}",
    ]

    llm_keys = [key for key in cfg.keys() if key.startswith("llm")]
    llm_keys.sort()
    
    for i, llm_key in enumerate(llm_keys):
        if i < len(cfg.agent_counts) and cfg.agent_counts[i] > 0:
            model_name = cfg[llm_key].language_models[0].model_name
            count = cfg.agent_counts[i]
            tags.append(f"{model_name}-{count}")

    wandb.init(
        project=cfg.wandb.project,
        entity=cfg.wandb.team,
        mode=cfg.wandb.mode,
        config=dict(cfg),
        tags=tags,
    )

    asyncio.run(run_experiment(cfg))
    wandb.finish()


if __name__ == "__main__":
    main()