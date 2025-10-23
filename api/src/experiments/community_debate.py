import logging
from tqdm import tqdm
import json
import random
import asyncio
import hydra
from omegaconf import DictConfig, OmegaConf
import wandb
from dotenv import load_dotenv
from typing import List, Type, Dict, Any, Tuple, Union, Optional, Callable, Literal
from asyncio import Semaphore

from src.agents.base_agent import AgentConfig
from src.normative_modules.base_normative_module import NormativeModule
from src.normative_modules.simple_normative_module import SimpleNormativeModule
from src.agents.debate.community_debate_agents import (
    BackgroundCommunityDebateAgent,
    NewcomerCommunityDebateAgent,
)
from src.llm_api import PromptConfig, LLMConfig
from src.environments.debate.utils import (
    get_question_data,
    load_and_prepare_data,
    save_results,
    log_to_wandb,
)

# Configure loggers
loggers = ["LiteLLM Proxy", "LiteLLM Router", "LiteLLM", "httpx"]
for logger_name in loggers:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.CRITICAL + 1)


def check_smiley_criteria(message: str) -> bool:
    """
    Check if a message contains smiley faces in the first few words.

    Args:
        message: The message string to check

    Returns:
        bool: True if the message contains :D or :) in the first 10 words, False otherwise
    """
    return any(smiley in message.split()[:10] for smiley in [":)", ":D"])


def create_specific_agents(
    agent_configs: List[AgentConfig],
    agent_class: Type[BackgroundCommunityDebateAgent | NewcomerCommunityDebateAgent],
    domain: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    num_total_agents: Optional[int] = None,
    normative_system_prompt: Optional[str] = None,
    debug: bool = False,
    normative_module: Optional[NormativeModule] = None,
) -> List[Union[BackgroundCommunityDebateAgent, NewcomerCommunityDebateAgent]]:
    """
    Create a list of agents based on their configurations.

    Args:
        agent_configs: List of agent configurations
        agent_class: The type of agent to create (Background or Newcomer)
        domain: The task domain (mmlu, math, commonsense_qa, or gsm8k)
        num_total_agents: Optional total number of agents in the experiment
        normative_system_prompt: Optional normative system prompt to append
        debug: Whether to enable debug mode

    Returns:
        List of created agents of the specified type
    """
    agents = []
    for config in agent_configs:
        num_agents = config.num_agents
        for i in range(num_agents):
            sys_prompt = config.prompts.system_prompt
            if normative_system_prompt is not None:
                sys_prompt += normative_system_prompt

            agent = agent_class(
                config=AgentConfig(
                    prompt_config=PromptConfig(
                        system_prompt=sys_prompt,
                        partials={
                            **(config.prompts.partials or {}),
                            **(config.prompts.additional_partials or {}),
                        },
                    ),
                    llm_config=LLMConfig.from_hydra_config(config.llm_config),
                    name=f"{config.name}_{i}",
                ),
                num_agents=num_total_agents or num_agents,
                domain=domain,
                debug=debug,
            )

            if normative_module is not None:
                agent.set_normative_module(normative_module)

            agents.append(agent)
    return agents


def create_all_agents(
    background_configs: List[AgentConfig],
    newcomer_configs: List[AgentConfig],
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    norm_config: DictConfig,
    reasoning_response_type: Literal[
        "zero_information", "full_information", "partial_information"
    ],
    num_total_agents: int,
    debug: bool = False,
    normative_module_config: Optional[DictConfig] = None,
) -> Tuple[
    List[BackgroundCommunityDebateAgent],
    List[NewcomerCommunityDebateAgent],
    List[Union[BackgroundCommunityDebateAgent, NewcomerCommunityDebateAgent]],
]:
    """
    Create both background and newcomer agents for the debate experiment.

    Args:
        background_configs: List of background agent configurations
        newcomer_configs: List of newcomer agent configurations
        task_name: The task domain name
        norm_config: Normative configuration from hydra
        reasoning_response_type: Type of reasoning response
        num_total_agents: Total number of agents in the experiment
        debug: Whether to enable debug mode

    Returns:
        A tuple containing:
        - List of background agents
        - List of newcomer agents
        - List of all agents combined

    Raises:
        ValueError: If the normative criteria or reasoning response type is not supported
    """
    # Create background agents
    background_agents = create_specific_agents(
        background_configs,
        BackgroundCommunityDebateAgent,
        task_name,
        num_total_agents,
        norm_config.system_prompt,
        debug,
    )

    # Set normative criteria and reasoning responses
    for agent in background_agents:
        # Directly use the check for smileyface as in the original
        if norm_config.name == "smileyface":
            agent.set_normative_criteria_fn(check_smiley_criteria)
        else:
            raise ValueError(f"Normative criteria {norm_config.name} is not supported")

        # Set the list of possible reasoning responses. Responses will be randomly sampled from the list.
        if reasoning_response_type == "zero_information":
            agent.set_reasoning_response([norm_config.zero_information_response])
        elif reasoning_response_type == "full_information":
            agent.set_reasoning_response([norm_config.full_information_response])
        elif reasoning_response_type == "partial_information":
            agent.set_reasoning_response(
                list(norm_config.partial_information_response.values())
            )
        else:
            raise ValueError(
                f"Reasoning response type {reasoning_response_type} is not supported"
            )

    # Create newcomer agents
    if normative_module_config is None:
        normative_module = None
    elif normative_module_config.name == "simple_normative_module":
        normative_module = SimpleNormativeModule(normative_module_config.llm_conf)

    newcomer_agents = create_specific_agents(
        newcomer_configs,
        NewcomerCommunityDebateAgent,
        task_name,
        num_total_agents,
        debug=debug,
        normative_module=normative_module,
    )

    # Build and initialize all agents
    all_agents = background_agents + newcomer_agents
    for agent in all_agents:
        agent.build()
        agent.reset()

    return background_agents, newcomer_agents, all_agents


async def run_debate_procedure(
    background_agents: List[BackgroundCommunityDebateAgent],
    newcomer_agents: List[NewcomerCommunityDebateAgent],
    question: str,
    question_prompt: Optional[str],
    num_rounds: int,
    summarize: bool,
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    norm_enforcement_first_round: int = 0,
    semaphore: Optional[Semaphore] = None,
) -> None:
    """
    Run debate rounds between background and newcomer agents.

    Args:
        background_agents: List of background agents
        newcomer_agents: List of newcomer agents
        question: The question string
        question_prompt: Additional prompt for the question (if applicable)
        num_rounds: Number of debate rounds to run
        summarize: Whether to summarize other agents' responses
        task_name: The task domain name
        norm_enforcement_first_round: The first round at which the norm is enforced
        semaphore: Optional semaphore for API call limiting
    """
    all_agents = background_agents + newcomer_agents

    # Set instruction for all agents
    for agent in all_agents:
        agent.set_instruction(question)

    # Debate rounds
    for debate in range(num_rounds + 1):
        if debate != 0:
            # Handle background agents
            async def process_background_agent(agent):
                async with semaphore:
                    # Get other background agents' responses
                    other_responses = [
                        other_agent.get_response(agent.latest_response())
                        for other_agent in background_agents
                        if other_agent != agent
                    ]

                    # Get newcomer agent responses with gather (preserved from original)
                    newcomer_tasks = [
                        newcomer_agent.get_response(agent.latest_response())
                        for newcomer_agent in newcomer_agents
                    ]
                    newcomer_responses = await asyncio.gather(*newcomer_tasks)
                    other_responses.extend(newcomer_responses)

                    return await agent.add_discussion_with_other_agents_in_context(
                        other_responses,
                        summarize=summarize,
                        additional_context=question_prompt
                        if task_name == "math" or task_name == "gsm8k"
                        else None,
                    )

            # Handle newcomer agents
            async def process_newcomer_agent(agent):
                async with semaphore:
                    if debate >= norm_enforcement_first_round:
                        other_responses = [
                            background_agent.get_response(agent.latest_response())
                            for background_agent in background_agents
                        ]
                    else:
                        other_responses = [
                            background_agent.latest_response()
                            for background_agent in background_agents
                        ]

                    return await agent.add_discussion_with_other_agents_in_context(
                        other_responses,
                        summarize=summarize,
                        additional_context=question_prompt
                        if task_name == "math" or task_name == "gsm8k"
                        else None,
                    )

            # Create all tasks
            background_tasks = [
                process_background_agent(agent) for agent in background_agents
            ]
            newcomer_tasks = [
                process_newcomer_agent(agent) for agent in newcomer_agents
            ]

            # Run all tasks concurrently
            await asyncio.gather(*(background_tasks + newcomer_tasks))

        # Generate answers with semaphore control
        async def generate_answer_with_semaphore(agent):
            async with semaphore:
                return await agent.generate_answer()

        answer_tasks = [generate_answer_with_semaphore(agent) for agent in all_agents]
        await asyncio.gather(*answer_tasks)


async def process_question(
    idx: int,
    question: str,
    answer: Union[str, int],
    question_prompt: Optional[str],
    background_configs: List[AgentConfig],
    newcomer_configs: List[AgentConfig],
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    norm_config: DictConfig,
    reasoning_response_type: Literal[
        "zero_information", "full_information", "partial_information"
    ],
    num_rounds: int,
    summarize: bool,
    debug: bool = False,
    norm_enforcement_first_round: int = 0,
    normative_module_config: Optional[DictConfig] = None,
    semaphore: Optional[Semaphore] = None,
) -> Dict[str, Any]:
    """
    Process a single question through the community debate experiment.

    Args:
        idx: Index of the question
        question: The question string
        answer: The correct answer
        question_prompt: Additional prompt for the question (if applicable)
        background_configs: List of background agent configurations
        newcomer_configs: List of newcomer agent configurations
        task_name: The task domain name
        norm_config: Normative configuration from hydra
        reasoning_response_type: Type of reasoning response
        num_rounds: Number of debate rounds
        summarize: Whether to summarize other agents' responses
        debug: Whether to enable debug mode
        norm_enforcement_first_round: The first round at which the norm is enforced
        normative_module_config: Optional normative module configuration
        semaphore: Optional semaphore for API call limiting

    Returns:
        Dictionary containing the question, agent responses, correct answer, and metadata
    """
    # Calculate total number of agents
    total_agents = sum(config.num_agents for config in background_configs) + sum(
        config.num_agents for config in newcomer_configs
    )

    # Create all agents
    background_agents, newcomer_agents, all_agents = create_all_agents(
        background_configs,
        newcomer_configs,
        task_name,
        norm_config,
        reasoning_response_type,
        total_agents,
        debug,
        normative_module_config=normative_module_config,
    )

    print(f"# Question No.{idx + 1} starts...")

    # Run debate rounds using the run_debate_round function
    await run_debate_procedure(
        background_agents,
        newcomer_agents,
        question,
        question_prompt,
        num_rounds,
        summarize,
        task_name,
        norm_enforcement_first_round,
        semaphore,
    )

    print(f"# Question No.{idx + 1} debate has ended.")

    debate_responses = {agent.name: agent.answer_history for agent in all_agents}
    # If there is a normative module, add its output as well
    if normative_module_config is not None:
        for agent in newcomer_agents:
            debate_responses["normative_module_" + agent.name] = (
                agent.normative_module.get_history()
            )

    return {
        "question_id": idx,
        "question": question,
        "agent_response": debate_responses,
        "answer": str(answer),
        "question_prompt": (
            question_prompt if task_name == "math" or task_name == "gsm8k" else None
        ),
    }


async def run_experiment(cfg: DictConfig) -> None:
    """
    Run the complete community debate experiment based on the provided configuration.

    Args:
        cfg: Hydra configuration object containing all experiment parameters

    Raises:
        ValueError: If the task domain is not supported

    The function:
    1. Sets up the experiment based on configuration
    2. Loads questions for the specified task
    3. Optionally runs a cost check on a single question
    4. Processes all questions in batches
    5. Evaluates results and logs them to Weights & Biases
    """
    # Display config parameters
    print("\nExperiment Configuration:")
    print(OmegaConf.to_yaml(OmegaConf.to_container(cfg, resolve=True)))
    print("\n" + "=" * 50 + "\n")

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
    norm_config = cfg.norm
    normative_module_config = (
        cfg.normative_module_conf if cfg.use_normative_module else None
    )

    # Calculate total number of agents
    num_agents = sum(config.num_agents for config in cfg.background_agents) + sum(
        config.num_agents for config in cfg.newcomer_agents
    )
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
    if cfg.get("cost_check", False):
        print("\nRunning cost check with one question...")

        # Get first question
        question, answer, question_prompt = get_question_data(questions[0], task_name)

        # Create background agents
        background_agents, newcomer_agents, all_agents = create_all_agents(
            cfg.background_agents,
            cfg.newcomer_agents,
            task_name,
            norm_config,
            cfg.reasoning_response_type,
            num_agents,
            cfg.debug,
            normative_module_config=normative_module_config,
        )

        # Run one complete debate round
        await run_debate_procedure(
            background_agents,
            newcomer_agents,
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
        total_cost = sum(agent.get_total_cost() for agent in all_agents)
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

    questions_pbar = tqdm(total=num_questions, desc="Questions processed", position=0)
    generated_description = []

    # Process questions in batches
    for batch_start in range(0, num_questions, concurrent_questions):
        batch_end = min(batch_start + concurrent_questions, num_questions)
        batch = range(batch_start, batch_end)

        print(f"\nProcessing batch of questions {batch_start+1} to {batch_end}")

        batch_tasks = []
        for idx in batch:
            question, answer, question_prompt = get_question_data(
                questions[idx], task_name
            )
            # Each question gets its own semaphore
            question_semaphore = asyncio.Semaphore(semaphore_permits)

            task = process_question(
                idx=idx,
                question=question,
                answer=answer,
                question_prompt=question_prompt,
                background_configs=cfg.background_agents,
                newcomer_configs=cfg.newcomer_agents,
                task_name=task_name,
                norm_config=norm_config,
                reasoning_response_type=cfg.reasoning_response_type,
                num_rounds=num_rounds,
                summarize=summarize,
                debug=cfg.debug,
                norm_enforcement_first_round=cfg.norm_enforcement_first_round,
                normative_module_config=normative_module_config,
                semaphore=question_semaphore,
            )
            batch_tasks.append(task)

        # Process this batch
        batch_results = await asyncio.gather(*batch_tasks)
        generated_description.extend(batch_results)
        questions_pbar.update(len(batch_results))

    questions_pbar.close()

    # Save results and get file paths using shared utility
    output_file, performance_file = save_results(
        generated_description=generated_description,
        output_dir=output_dir,
        task_name=task_name,
        num_rounds=num_rounds,
        strict=cfg.get("strict", False),
    )

    # Log to wandb using shared utility
    log_to_wandb(
        generated_description=generated_description,
        task_name=task_name,
        num_rounds=num_rounds,
        output_file=output_file,
        performance_file=performance_file,
    )


load_dotenv()


@hydra.main(
    version_base=None,
    config_path="../conf",
    config_name="community_debate",
)
def main(cfg: DictConfig) -> None:
    """
    Main entry point for the community debate experiment.

    Args:
        cfg: Hydra configuration object
    """
    # do the wandb init here
    wandb.init(
        project=cfg.wandb.project,
        mode=cfg.wandb.mode,
        entity=cfg.wandb.team,
        config=dict(cfg),
    )
    asyncio.run(run_experiment(cfg))


if __name__ == "__main__":
    main()
