import logging
import json
import random
import asyncio
import hydra
from tqdm import tqdm
from omegaconf import DictConfig, OmegaConf

from src.agents.base_agent import AgentConfig
from src.agents.debate.basic_debate_agent import BasicDebateAgent
from src.environments.debate.utils import (
    load_mmlu_data,
    load_gsm8k_data,
    load_commonsense_qa_data,
    parse_mmlu_question_answer,
    parse_commonsense_qa_question_answer,
    parse_gsm8k_question_answer,
    generate_math_question,
)
from src.llm_api import PromptConfig, LLMConfig
from src.analysis.evaluation import evaluate_results, compute_accuracy

# Configure loggers
loggers = ["LiteLLM Proxy", "LiteLLM Router", "LiteLLM", "httpx"]
for logger_name in loggers:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.CRITICAL + 1)


async def process_question(idx, question, agent_config, task_name, debug=False):
    # Create a new agent instance for this specific question
    agent = BasicDebateAgent(
        config=agent_config,
        num_agents=1,
        domain=task_name,
        debug=debug,  # Set debug to False for concurrent processing
    )
    agent.build()
    agent.reset()

    if task_name == "mmlu":
        question_text, answer = parse_mmlu_question_answer(question)
        # Store the original question format
        original_question = {
            "question": question["question"],
            "A": question["A"],
            "B": question["B"],
            "C": question["C"],
            "D": question["D"],
            "answer": answer,
        }
        options = {
            "A": question["A"],
            "B": question["B"],
            "C": question["C"],
            "D": question["D"],
        }
    elif task_name == "math":  # math
        question_text, answer, question_prompt = (
            question["question"],
            question["answer"],
            question["question_prompt"],
        )
        options = None
    elif task_name == "commonsense_qa": # commonsense_qa
        question_text, answer = parse_commonsense_qa_question_answer(question)
        # Store the original question format
        original_question = question
        options = {}
        for choice in question["question"]["choices"]:
            options[choice["label"]] = choice["text"]
    elif task_name == "gsm8k":
        question_text, answer = parse_gsm8k_question_answer(question)
        # Store the original question format
        original_question = question


    # No need to reset since we have a fresh agent
    agent.set_instruction(question_text)

    # Generate answer
    await agent.generate_answer()

    debate_responses = {agent.name: agent.answer_history}
    agent_response = debate_responses[agent.name][-1]

    is_correct = compute_accuracy(answer, agent_response, task_name, strict=True)

    return {
        "question_id": idx,
        "original_format": original_question if task_name in ["mmlu", "commonsense_qa", "gsm8k"] else None,
        "question": question_text,
        "agent_response": debate_responses,
        "answer": str(answer),
        "question_prompt": question_prompt if task_name == "math" else None,
        "options": options if task_name in ["mmlu", "commonsense_qa"] else None,
        "is_correct": is_correct,
    }


async def run_experiment(cfg: DictConfig):
    # Display config parameters
    print("\nExperiment Configuration:")
    print(OmegaConf.to_yaml(OmegaConf.to_container(cfg, resolve=True)))
    print("\n" + "=" * 50 + "\n")

    task_name = cfg.task.name
    assert task_name in ["mmlu", "math", "commonsense_qa", "gsm8k"], "Task domain must be mmlu, math, gsm8k, or commonsense_qa"

    # Add back important assertions
    assert cfg.experiment.num_agents == 1, (
        "No debate, we are only trying to see where a single agent fails."
    )
    assert cfg.experiment.num_rounds == 0, (
        "No debate, we are only trying to see where a single agent fails."
    )

    # Get experiment parameters from config
    num_questions = cfg.experiment.num_questions
    output_dir = cfg.exp_dir
    max_wrong_responses = cfg.experiment.get("max_wrong_responses", 5)
    assert num_questions > max_wrong_responses, (
        "Number of questions must be greater than max_wrong_responses"
    )

    # Create the agent config once
    agent_config = AgentConfig(
        prompt_config=PromptConfig(
            system_prompt=cfg.agent.prompts.system_prompt,
            partials={
                **(cfg.agent.prompts.partials or {}),
                **(cfg.agent.prompts.additional_partials or {}),
            },
        ),
        llm_config=LLMConfig.from_hydra_config(cfg.agent.llm_config),
        name=f"{cfg.agent.name}_0",
    )
    debug = cfg.debug

    random.seed(cfg.seed)

    # Load and prepare data
    if task_name == "mmlu":
        questions = load_mmlu_data(cfg.task.data_path)
        print(f"Loaded {len(questions)} questions from {cfg.task.data_path}")
        random.shuffle(questions)
    elif task_name == "commonsense_qa":
        questions = load_commonsense_qa_data(cfg.task.data_path)
        print(f"Loaded {len(questions)} questions from {cfg.task.data_path}")
        random.shuffle(questions)
    elif task_name == "math":
        questions = []
        for _ in range(num_questions):
            question, answer, question_prompt = generate_math_question()
            questions.append(
                {
                    "question": question,
                    "question_prompt": question_prompt,
                    "answer": answer,
                }
            )
    elif task_name == "gsm8k":
        questions = load_gsm8k_data(cfg.task.data_path)
        print(f"Loaded {len(questions)} questions from {cfg.task.data_path}")
        random.shuffle(questions)

    # Add rate limiting configuration based on model
    # BATCH_SIZE = 5  # gpt-3.5 ~ 5
    assert cfg.batch_size is not None, "Batch size must be specified"
    BATCH_SIZE = cfg.batch_size
    # TODO: make this config parameter later!!

    # Create tasks with the agent config instead of agent instances
    tasks = []
    for idx in range(num_questions):
        task = process_question(idx, questions[idx], agent_config, task_name, debug)
        tasks.append(task)

    generated_description = []
    wrong_responses = []

    # Process tasks in batches
    questions_pbar = tqdm(total=num_questions, desc="Questions processed", position=0)
    wrong_answers_pbar = tqdm(
        total=max_wrong_responses, desc="Wrong answers found", position=1
    )

    for i in range(0, len(tasks), BATCH_SIZE):
        if len(wrong_responses) >= max_wrong_responses:
            print(f"\nReached target number of wrong responses ({max_wrong_responses})")
            break

        batch = tasks[i : i + BATCH_SIZE]
        # Process batch concurrently
        batch_results = await asyncio.gather(*batch)

        for result in batch_results:
            questions_pbar.update(1)

            if len(wrong_responses) >= max_wrong_responses:
                break

            is_wrong = not result["is_correct"]

            if is_wrong:
                wrong_answers_pbar.update(1)
                # Store wrong responses with both original format and agent's response
                if task_name == "mmlu":
                    wrong_response = {
                        "question": result["original_format"]["question"],
                        "A": result["original_format"]["A"],
                        "B": result["original_format"]["B"],
                        "C": result["original_format"]["C"],
                        "D": result["original_format"]["D"],
                        "answer": result["original_format"]["answer"],
                        "agent_response": result["agent_response"],
                    }
                    wrong_responses.append(wrong_response)
                elif task_name == "commonsense_qa":
                    # save original format to create a new dataset
                    wrong_responses.append(result["original_format"])
                elif task_name == "gsm8k":
                    wrong_responses.append({
                            "question": result["question"],
                            "answer": result["answer"],
                            "agent_response": result["agent_response"],
                        })
                else:
                    wrong_responses.append(
                        {
                            "question": result["question"],
                            "answer": result["answer"],
                            "question_prompt": result["question_prompt"],
                            "agent_response": result["agent_response"],
                            "agent_answer": result["agent_response"][agent_config.name][
                                -1
                            ],
                        }
                    )

                logger.info(f"Wrong response: {wrong_responses[-1]}")

            generated_description.append(result)

    questions_pbar.close()
    wrong_answers_pbar.close()

    # Save all results
    output_file = f"{output_dir}/{task_name}_result.json"
    print(f"Saving results to {output_file}")
    with open(output_file, "w") as f:
        json.dump(generated_description, f, indent=4)

    # Save wrong responses to a separate file
    wrong_responses_file = (
        f"{output_dir}/{task_name}_wrong_responses_{max_wrong_responses}.json"
    )
    print(f"Saving wrong responses to {wrong_responses_file}")
    with open(wrong_responses_file, "w") as f:
        if task_name == "commonsense_qa":
            for item in wrong_responses:
                f.write(json.dumps(item) + "\n")
        else:
            json.dump(wrong_responses, f, indent=4)

    # Run evaluation directly after generating results
    print("\nRunning evaluation on results...")
    performance = evaluate_results(
        generated_description,
        0,
        cfg.experiment.num_agents,
        cfg.agent.name,
        task_name,
        strict=cfg.get("strict", False),  # Use strict if provided, otherwise False
    )

    # Save performance results
    performance_file = f"{output_dir}/{task_name}_performance.json"
    print(f"Saving performance metrics to {performance_file}")
    with open(performance_file, "w") as f:
        json.dump(performance, f, indent=4)

    print(
        f"Found {len(wrong_responses)} wrong responses out of {num_questions} questions"
    )
    print("All done!!")


@hydra.main(version_base=None, config_path="../conf", config_name="generate_dataset")
def main(cfg: DictConfig):
    asyncio.run(run_experiment(cfg))


if __name__ == "__main__":
    main()
