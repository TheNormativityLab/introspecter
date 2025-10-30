import os
import json
import pandas as pd
import numpy as np
import logging, re
from tqdm import tqdm
import wandb
import random
from typing import List, Dict, Any, Tuple, Union, Optional, Literal
from omegaconf import DictConfig

from hydra.utils import get_original_cwd
from src.analysis.evaluation import evaluate_results, evaluate_single_debate_result
from src.environments.debate.adts import DebateResult

# Configure loggers
loggers = ["LiteLLM Proxy", "LiteLLM Router", "LiteLLM", "httpx"]
for logger_name in loggers:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.CRITICAL + 1)

def safe_get_original_cwd():
    """Get original working directory, handling case where Hydra isn't initialized"""
    try:
        from hydra.utils import get_original_cwd
        return get_original_cwd()
    except ValueError:
        import os
        return os.getcwd()

def load_mmlu_data(file_path):
    # Convert relative path to absolute path from original working directory
    abs_path = os.path.join(safe_get_original_cwd(), file_path)
    with open(abs_path, "r") as f:
        data = json.load(f)
    return data


def load_commonsense_qa_data(file_path):
    """Load commonsense QA data from JSON or JSONL file."""
    abs_path = os.path.join(safe_get_original_cwd(), file_path)
    
    with open(abs_path, "r", encoding='utf-8') as json_file:
        content = json_file.read().strip()
    
    if content.startswith('['):
        data = json.loads(content)
    else:
        lines = content.split('\n')
        data = []
        for line in lines:
            line = line.strip()
            if line:  # Skip empty lines
                data.append(json.loads(line))
    
    return data


def load_gsm8k_data(file_path):
    abs_path = os.path.join(safe_get_original_cwd(), file_path)
    with open(abs_path, "r") as f:
        return [json.loads(line) for line in f.readlines() if line]

def parse_mmlu_question_answer(df):
    question = f"Can you answer the following question as accurately as possible? {df['question']}: A) {df['A']}, B) {df['B']}, C) {df['C']}, D) {df['D']} Explain your answer by providing a bullet point summary of your reasoning, putting the answer in the form (X) at the end of your response."
    answer = df["answer"]
    return question, answer


def parse_commonsense_qa_question_answer(data):
    """Parse commonsense QA question and answer from data."""
    
    if "question" in data and isinstance(data["question"], str):
        question_text = data["question"]
        choices = {}
        for label in ["A", "B", "C", "D", "E"]:
            if label in data:
                choices[label] = data[label]
        
        question = (
            f"Can you answer the following question as accurately as possible? "
            f"{question_text}: "
            f"A) {choices.get('A', 'N/A')}, "
            f"B) {choices.get('B', 'N/A')}, "
            f"C) {choices.get('C', 'N/A')}, "
            f"D) {choices.get('D', 'N/A')}, "
            f"E) {choices.get('E', 'N/A')} "
            f"Explain your answer by providing a bullet point summary of your reasoning, "
            f"putting the answer in the form (X) at the end of your response."
        )
        
        answer = data.get("answer", "")
        
    elif "question" in data and isinstance(data["question"], dict):
        choices = {}
        for choice in data["question"]["choices"]:
            choices[choice["label"]] = choice["text"]
        
        question = (
            f"Can you answer the following question as accurately as possible? "
            f"{data['question']['stem']}: "
            f"A) {choices['A']}, "
            f"B) {choices['B']}, "
            f"C) {choices['C']}, "
            f"D) {choices['D']}, "
            f"E) {choices['E']} "
            f"Explain your answer by providing a bullet point summary of your reasoning, "
            f"putting the answer in the form (X) at the end of your response."
        )
        
        answer = data["answerKey"]
    
    else:
        raise ValueError(f"Unexpected commonsense QA data format: {data}")
    
    return question, answer

def parse_gsm8k_question_answer(data):
    question = data["question"]
    match = re.search(r"####\s*(\S+)", data["answer"])
    if match:
        final_answer = match.group(1)
    formatted_question = f"Can you solve the following math problem? {question} Provide a bullet point summary of your reasoning. Your final answer should be a single numerical number, in the form \\boxed{{answer}}, at the end of your response."

    return formatted_question, final_answer


def generate_math_question():
    a, b, c, d, e, f = np.random.randint(0, 30, size=6)

    answer = a + b * c + d - e * f
    question = f"What is the result of {a}+{b}*{c}+{d}-{e}*{f}? Provide a bullet point summary of your reasoning. Make sure to state your answer at the end of the response."

    question_prompt = f"We seek to find the result of {a}+{b}*{c}+{d}-{e}*{f}?"

    return question, answer, question_prompt


def get_question_data(
    question_data: Dict[str, Any],
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
) -> Tuple[str, Union[str, int], Optional[str]]:
    """
    Extract question, answer, and question_prompt for a given question and task.

    Args:
        question: A single question data dictionary
        task_name: The task domain name

    Returns:
        A tuple containing:
        - The question string
        - The answer (string or integer)
        - The question prompt (if applicable, otherwise None)

    Raises:
        ValueError: If the task domain is not supported
    """
    if isinstance(question_data, dict) and all(k in question_data for k in ['question', 'answer', 'question_prompt']):
        return (
            question_data['question'],
            question_data['answer'],
            question_data['question_prompt']
        )
    
    if task_name == "mmlu":
        question_str, answer = parse_mmlu_question_answer(question_data)
        return question_str, answer, question_str
    
    elif task_name == "gsm8k":
        question_str, answer = parse_gsm8k_question_answer(question_data)
        return question_str, answer, question_str
    
    elif task_name == "commonsense_qa":
        question_str, answer = parse_commonsense_qa_question_answer(question_data)
        return question_str, answer, question_str
    
    else:
        raise ValueError(f"Unsupported task: {task_name}")

def _normalize_answer(answer: str) -> str:
    """
    Normalize an answer for comparison.
    Handles multiple choice (A, B, C, D) and numeric answers.
    """
    import re
    
    if not answer:
        return ""
    
    answer = str(answer).strip().lower()    
    mc_patterns = [
        r'^([a-z])\)',
        r'^([a-z])\.',  
        r'^([a-z])\s',
        r'^\(([a-z])\)', 
        r'^([a-z])$', 
        r'(?:answer|option).*?([a-z])',
    ]
    
    for pattern in mc_patterns:
        match = re.search(pattern, answer)
        if match:
            return match.group(1)
    
    numeric_patterns = [
        r'(?:equals?|is|=)\s*([+-]?\d+\.?\d*)',
        r'(?:answer|result).*?([+-]?\d+\.?\d*)',
        r'\b([+-]?\d+\.?\d*)\s*$',
        r'^([+-]?\d+\.?\d*)$',
    ]
    
    for pattern in numeric_patterns:
        match = re.search(pattern, answer)
        if match:
            return match.group(1).strip()
    
    answer = re.sub(r'[^\w\s]', '', answer)
    answer = ' '.join(answer.split())
    return answer


def _answers_match(extracted: str, correct: str) -> bool:
    """
    Compare two answers with normalization.
    Returns True if answers match after normalization.
    """
    if not extracted or not correct:
        return False
    
    if str(extracted).strip().lower() == str(correct).strip().lower():
        return True
    
    normalized_extracted = _normalize_answer(extracted)
    normalized_correct = _normalize_answer(correct)
    
    if normalized_extracted == normalized_correct:
        return True

    extracted_clean = str(extracted).strip().lower()
    correct_clean = str(correct).strip().lower()
    
    if (extracted_clean.startswith(correct_clean + ')') or
        extracted_clean.startswith(correct_clean + '.') or
        extracted_clean.startswith(correct_clean + ' ') or
        extracted_clean.startswith('(' + correct_clean + ')')):
        return True
    
    return False

def load_and_prepare_data(
    task_name: Literal["mmlu", "math", "commonsense_qa", "gsm8k"],
    data_path: Optional[str],
    num_questions: int,
    seed: int,
) -> List[Dict[str, Any]]:
    """
    Load and prepare data for the specified task.

    Args:
        task_name: The task domain name
        data_path: Path to the data file
        num_questions: Number of questions to use
        seed: Random seed for shuffling

    Returns:
        List of prepared questions

    Raises:
        ValueError: If the task domain is not supported
    """
    random.seed(seed)

    if task_name == "mmlu":
        questions = load_mmlu_data(data_path)
        random.shuffle(questions)
    elif task_name == "commonsense_qa":
        questions = load_commonsense_qa_data(data_path)
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
        questions = load_gsm8k_data(data_path)
        random.shuffle(questions)
    else:
        raise ValueError(f"Task domain {task_name} is not supported")
    if task_name != "math" and num_questions > 0:
        questions = questions[:num_questions]
    return questions

def save_results(
    generated_results: List[DebateResult],
    output_dir: str,
    task_name: str,
    num_rounds: int,
    strict: bool = False,
    seed: Optional[int] = None,  # Add seed parameter
) -> Tuple[str, str]:
    """
    Save experiment results and performance metrics.
    Args:
        generated_results: List of DebateResult objects
        output_dir: Directory to save results
        task_name: Name of the task
        num_rounds: Number of debate rounds
        strict: Whether to use strict evaluation
        seed: Seed value to include in filename for uniqueness
    Returns:
        Tuple of (results_file_path, performance_file_path)
    """
    # Create unique filename that includes seed if provided
    if seed is not None:
        base_filename = f"{task_name}_seed{seed}"
    else:
        base_filename = task_name
    
    # Convert to JSON-serializable format for saving
    serialized_results = [result.model_dump() for result in generated_results]
    
    # Save results
    output_file = f"{output_dir}/{base_filename}_result.json"
    print(f"Saving results to {output_file}")
    with open(output_file, "w") as f:
        json.dump(serialized_results, f, indent=4)
    
    # Run evaluation directly on DebateResult objects
    print("\nRunning evaluation on results...")
    performance = evaluate_results(
        generated_results,  # Pass DebateResult objects directly
        num_rounds,
        task_name,
        strict=strict,
    )
    
    # Save performance results
    if "wrong" in str(output_dir):
        performance_file = f"{output_dir}/{base_filename}_hard_performance.json"
    else:
        performance_file = f"{output_dir}/{base_filename}_performance.json"
    
    print(f"Saving performance metrics to {performance_file}")
    with open(performance_file, "w") as f:
        json.dump(performance, f, indent=4)
    
    return output_file, performance_file


def calculate_debate_metrics(
    debate_result: DebateResult,
    task_name: str,
    num_rounds: int,
    strict: bool = False,
) -> Dict[str, Any]:
    """
    Calculate metrics for a single debate result.

    Args:
        debate_result: A single DebateResult object
        task_name: Name of the task domain
        num_rounds: Number of debate rounds
        strict: Whether to use strict evaluation

    Returns:
        Dictionary containing all calculated metrics
    """
    metrics = {}

    # Get agent names and responses
    agent_responses = debate_result.debate_session.get_agent_responses()
    agent_names = list(agent_responses.keys())
    metrics["agent_names"] = agent_names

    # Collect agent accuracies for each round
    agent_accuracies = {agent: [] for agent in agent_names}
    majority_vote_accuracies = []

    # Evaluate each round separately
    for turn in range(num_rounds + 1):
        turn_accuracies = evaluate_single_debate_result(
            debate_result, turn, task_name, strict=strict
        )

        # Store majority vote accuracy
        majority_vote_accuracies.append(turn_accuracies.get("majority_vote", 0))

        # Store per-agent accuracy
        for agent in agent_names:
            if agent in turn_accuracies:
                agent_accuracies[agent].append(turn_accuracies[agent])

    metrics["agent_accuracies"] = agent_accuracies
    metrics["majority_vote_accuracies"] = majority_vote_accuracies

    # Calculate total conversion metrics
    metrics["conversion_metrics"] = calculate_total_conversion_rate(agent_accuracies)

    # Format agent responses with round headers
    formatted_responses = {}
    for agent in agent_names:
        responses = agent_responses.get(agent, [])
        formatted_text = [
            f"\n\n---------- ROUND {i} ----------\n\n {response}"
            for i, response in enumerate(responses)
        ]
        formatted_responses[agent] = "".join(formatted_text)

    metrics["formatted_responses"] = formatted_responses

    return metrics


def log_single_debate_result(
    debate_result: DebateResult,
    task_name: str,
    num_rounds: int,
    strict: bool = False,
) -> None:
    """
    Log a single question result as a table with each metric as its own column.
    """
    # Calculate all metrics
    metrics = calculate_debate_metrics(debate_result, task_name, num_rounds, strict)
    agent_names = metrics["agent_names"]
    agent_accuracies = metrics["agent_accuracies"]
    majority_vote_accuracies = metrics["majority_vote_accuracies"]
    formatted_responses = metrics["formatted_responses"]
    conversion_metrics = metrics["conversion_metrics"]

    # Define all columns for the table
    columns = ["question_id", "question", "correct_answer", "majority_vote_accuracies"]

    # Add columns for each agent's accuracies and responses
    for agent in agent_names:
        columns.append(f"{agent}_accuracies")
        columns.append(f"{agent}_responses")

    # Add conversion metrics columns
    columns.append("conversion_ratio")
    columns.append("total_correct_states")
    columns.append("total_conversions_to_incorrect")

    for agent in agent_names:
        columns.append(f"{agent}_total_conversion")

    # Create the table
    question_table = wandb.Table(columns=columns)

    # Prepare the single row with all metrics
    row = [
        debate_result.question_id,
        debate_result.question,
        debate_result.correct_answer,
        str(majority_vote_accuracies),  # Convert list to string for the table
    ]

    # Add agent accuracies and responses
    for agent in agent_names:
        row.append(str(agent_accuracies[agent]))  # Convert list to string
        row.append(formatted_responses[agent])

    # Add conversion metrics
    row.append(conversion_metrics.get("conversion_ratio", 0.0))
    row.append(conversion_metrics.get("total_correct_states", 0))
    row.append(conversion_metrics.get("total_conversions_to_incorrect", 0))

    for agent in agent_names:
        row.append(conversion_metrics.get(f"{agent}_total_conversion", 0.0))

    # Add the single row with all metrics
    question_table.add_data(*row)

    # Log the table
    table_name = f"question_{debate_result.question_id}_results"
    wandb.log(
        {
            table_name: question_table,
        }
    )


def log_to_wandb(
    generated_results: List[DebateResult],
    task_name: str,
    num_rounds: int,
    output_file: str,
    performance_file: str,
    strict: bool = False,
) -> None:
    """
    Log experiment results to Weights & Biases.

    Args:
        generated_results: List of DebateResult objects
        task_name: Name of the task
        num_rounds: Number of debate rounds
        output_file: Path to results file
        performance_file: Path to performance file
        strict: Whether to use strict evaluation
    """
    # Get agent names from the first result (assume all results have the same agents)
    first_result_metrics = calculate_debate_metrics(
        generated_results[0], task_name, num_rounds, strict
    )
    agent_names = first_result_metrics["agent_names"]

    # Create results table with expanded columns for new metrics
    results_table = wandb.Table(
        columns=[
            "question_id",
            "question",
            "correct_answer",
            "majority_vote_accuracies",
        ]
        + [f"{agent}_accuracies" for agent in agent_names]
        + [f"{agent}_responses" for agent in agent_names]
        + ["conversion_ratio", "total_correct_states", "total_conversions_to_incorrect"]
        + [f"{agent}_total_conversion" for agent in agent_names]
    )

    # Track conversion ratios for performance table
    avg_conversion_ratios = {f"round_{i+1}": [] for i in range(num_rounds + 1)}

    # Process each debate result
    for result in generated_results:
        # Calculate metrics
        metrics = calculate_debate_metrics(result, task_name, num_rounds, strict)
        agent_accuracies = metrics["agent_accuracies"]
        majority_vote_accuracies = metrics["majority_vote_accuracies"]
        formatted_responses = metrics["formatted_responses"]
        conversion_metrics = metrics["conversion_metrics"]

        # Add to conversion ratios for performance table
        for round_idx in range(num_rounds + 1):
            round_name = f"round_{round_idx + 1}"
            if "conversion_ratio" in conversion_metrics:
                avg_conversion_ratios[round_name].append(
                    conversion_metrics["conversion_ratio"]
                )

        # Start building row with basic info
        row = [
            result.question_id,
            result.question,
            result.correct_answer,
            str(majority_vote_accuracies),
        ]

        # Add agent accuracies
        for agent in agent_names:
            row.append(str(agent_accuracies[agent]))

        # Add agent responses
        for agent in agent_names:
            row.append(formatted_responses[agent])

        # Add conversion metrics
        row.append(conversion_metrics.get("conversion_ratio", 0.0))
        row.append(conversion_metrics.get("total_correct_states", 0))
        row.append(conversion_metrics.get("total_conversions_to_incorrect", 0))

        for agent in agent_names:
            row.append(conversion_metrics.get(f"{agent}_total_conversion", 0.0))

        results_table.add_data(*row)

    # Calculate average conversion ratios
    for round_name in avg_conversion_ratios:
        if avg_conversion_ratios[round_name]:
            avg_conversion_ratios[round_name] = sum(
                avg_conversion_ratios[round_name]
            ) / len(avg_conversion_ratios[round_name])
        else:
            avg_conversion_ratios[round_name] = 0.0

    # Create performance table
    performance_table = wandb.Table(
        columns=["round", "accuracy", "agent_accuracies", "avg_conversion_ratio"]
    )

    with open(performance_file, "r") as f:
        performance = json.load(f)

        # Add performance data to the table
        for round_dict in performance:
            for round_name, accuracy_dict in round_dict.items():
                # Get all agent accuracies as a string
                agent_acc_str = ", ".join(
                    [
                        f"{agent}: {acc:.2f}"
                        for agent, acc in accuracy_dict.items()
                        if agent != "majority_vote"
                    ]
                )

                # Add the data
                performance_table.add_data(
                    round_name,
                    accuracy_dict.get("majority_vote", 0.0),
                    agent_acc_str,
                    avg_conversion_ratios.get(round_name, 0.0),
                )

    # Get final accuracy
    final_round_dict = performance[-1]
    final_round_key = list(final_round_dict.keys())[0]

    # Log to wandb
    wandb.log(
        {
            "results_table": results_table,
            "performance_table": performance_table,
            "final_accuracy": final_round_dict[final_round_key].get(
                "majority_vote", 0.0
            ),
            "task_name": task_name,
            "num_rounds": num_rounds,
            "avg_conversion_metrics": dict(avg_conversion_ratios),
        }
    )

    # Save files to wandb
    wandb.save(output_file)
    wandb.save(performance_file)


def calculate_total_conversion_rate(
    agent_accuracies: Dict[str, List[float]],
) -> Dict[str, float]:
    """
    Calculate total conversion rate (correct → incorrect) across all rounds.

    Args:
        agent_accuracies: Dictionary mapping agent names to accuracy lists

    Returns:
        Dictionary with following metrics:
        - total_correct_states: Total number of correct answers over all rounds and agents
        - total_conversions_to_incorrect: Total number of conversions to incorrect answers over all rounds and agents
        - conversion_ratio: (total_conversions_to_incorrect / total_correct_states)
    """
    total_metrics = {}

    # Count overall conversions
    total_correct_states = 0
    total_conversions = 0

    # Track per-agent stats
    agent_stats = {}

    for agent, accuracies in agent_accuracies.items():
        # Need at least two rounds to calculate conversion
        if len(accuracies) < 2:
            continue

        agent_stats[agent] = {"correct_states": 0, "conversions_to_incorrect": 0}

        # Check each consecutive pair of rounds
        for i in range(len(accuracies) - 1):
            # Only count if agent was correct in the current round
            if accuracies[i] == 1.0:
                agent_stats[agent]["correct_states"] += 1
                total_correct_states += 1

                # If agent went from correct to incorrect
                if accuracies[i + 1] == 0.0:
                    agent_stats[agent]["conversions_to_incorrect"] += 1
                    total_conversions += 1

        # check if the agent was correct in the final round
        if accuracies[-1] == 1.0:
            agent_stats[agent]["correct_states"] += 1
            total_correct_states += 1

    # Add total correct states and conversions to incorrect
    total_metrics["total_correct_states"] = total_correct_states
    total_metrics["total_conversions_to_incorrect"] = total_conversions

    # Calculate per-agent conversion rates
    for agent, stats in agent_stats.items():
        if stats["correct_states"] > 0:
            total_metrics[f"{agent}_total_conversion"] = (
                stats["conversions_to_incorrect"] / stats["correct_states"]
            )
        else:
            total_metrics[f"{agent}_total_conversion"] = 0.0

    # Calculate overall conversion rate
    if total_correct_states > 0:
        total_metrics["conversion_ratio"] = total_conversions / total_correct_states
    else:
        total_metrics["conversion_ratio"] = 0.0

    return total_metrics
