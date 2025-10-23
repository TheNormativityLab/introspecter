import numpy as np
import re
from typing import List, Dict, Any, Union, Optional
from src.environments.debate.adts import DebateResult


# MMLU-specific evaluation functions
def solve_math_problems(input_str):
    pattern = r"\d+\.?\d*"
    matches = re.findall(pattern, input_str)
    if matches:
        return matches[-1]
    return None


def parse_mmlu_answer(input_str):
    """
    Parse the answer from the input string. The pattern is (X) where X is the answer. The last (X) is the answer.
    """
    pattern = r"([A-Za-z])\)"
    matches = re.findall(pattern, input_str)

    solution = None
    for match_str in matches[::-1]:
        solution = match_str.upper()
        if solution:
            break

    return solution


# Same as MMLU
def parse_commonsense_qa_answer(input_str):
    """
    Parse the answer from the input string. The pattern is (X) where X is the answer. The last (X) is the answer.
    """
    pattern = r"([A-Za-z])\)"
    matches = re.findall(pattern, input_str)

    solution = None
    for match_str in matches[::-1]:
        solution = match_str.upper()
        if solution:
            break

    return solution


# Math-specific evaluation functions
def parse_math_answer(input_str):
    """
    Find the last number (positive or negative) in the input string.
    """
    pattern = r"(-?\d*\.?\d+)"  # Matches positive/negative integers and decimals
    matches = re.findall(pattern, input_str)

    solution = None
    for match_str in matches[::-1]:
        solution = re.sub(r"[^0-9.-]", "", match_str)
        if solution:
            break

    if solution:
        return float(solution)
    else:
        return solution


def parse_gsm8k_answer(input_str):
    """
    Parse the answer from the input string. The pattern is \boxed{answer}.
    """
    pattern = r"\{([0-9.,$]*)\}"
    matches = re.findall(pattern, input_str)

    solution = None

    for match_str in matches[::-1]:
        solution = re.sub(r"[^0-9.]", "", match_str)
        if solution:
            break

    return solution


# Common evaluation functions
def most_frequent(answers: List):
    counter = 0
    if not answers:
        return None
    num = answers[0]

    for i in answers:
        current_frequency = answers.count(i)
        if current_frequency > counter:
            counter = current_frequency
            num = i

    return num


def answer_check(predicted_answers, gt_answer, strict=False):
    if len(predicted_answers) == 0:
        return 0.0

    # Return 0 if agents disagree (not all answers are the same)
    if strict:
        if len(set(predicted_answers)) > 1:
            return 0.0

    # Return 1 if the answer is in the predicted answers
    if gt_answer == most_frequent(predicted_answers):
        return 1.0
    else:
        return 0.0


def compute_accuracy(gt, pred_solutions, task_name, strict=False):
    # gt is the answer key for the round (ground truth)
    # pred_solutions must be a single agent's answer!
    def compare_with_gt(pred_answer):
        if pred_answer is None:
            return 0

        if task_name == "math":
            gt_value = float(gt) if isinstance(gt, str) else gt
            return 1.0 if pred_answer == gt_value else 0.0
        elif task_name == "gsm8k":
            gt_value = solve_math_problems(gt)
            return 1.0 if pred_answer == gt_value else 0.0

        return 1.0 if pred_answer == gt else 0.0

    def parse_single_answer(solution, task_name):
        answer = None
        
        if task_name == "mmlu":
            answer = parse_mmlu_answer(solution)
            if answer is None:
                answer = solve_math_problems(solution)
        elif task_name == "math":
            answer = parse_math_answer(solution)
        elif task_name == "commonsense_qa":
            answer = parse_commonsense_qa_answer(solution)
        elif task_name == "gsm8k":
            answer = parse_gsm8k_answer(solution)
        else:
            answer = ""
            
        return answer
    
    # Handle multi-agent case
    if isinstance(pred_solutions, list):
        pred_answers = []
        for solution in pred_solutions:
            answer = parse_single_answer(solution, task_name)
            if answer is not None:
                pred_answers.append(answer)

        if not pred_answers:
            return 0

        if task_name == "math":
            gt_value = float(gt) if isinstance(gt, str) else gt
            return answer_check(pred_answers, gt_value, strict=strict)
        elif task_name == "gsm8k":
            gt_value = solve_math_problems(gt)
            if gt_value is None:
                return None
            return answer_check(pred_answers, gt_value, strict=strict)
        # for all other tasks
        return answer_check(pred_answers, gt, strict=strict)

    # Handle single agent case
    pred_answer = parse_single_answer(pred_solutions, task_name)
    return compare_with_gt(pred_answer)

def evaluate_single_debate_result(
    debate_result: DebateResult, turn: int, task_name: str, strict: bool = False
) -> Dict[str, float]:
    """
    Evaluate a single debate result for a specific turn.

    Args:
        debate_result: A single DebateResult object
        turn: The debate turn to evaluate
        task_name: Name of the task domain
        strict: Whether to use strict evaluation

    Returns:
        Dictionary mapping agent names to their accuracy scores
    """
    # Get the debate and agent names from the debate session
    agent_responses = debate_result.debate_session.get_agent_responses()
    agents = list(agent_responses.keys())

    # Initialize accuracies for each agent
    result_accuracies = {"majority_vote": None}
    for agent in agents:
        result_accuracies[agent] = None

    # Get responses for this turn from all agents
    individual_agent_responses = []
    for agent in agents:
        # Get this agent's response for the current turn
        agent_rounds = agent_responses.get(agent, [])
        if turn < len(agent_rounds):
            response = agent_rounds[turn]
            gt = debate_result.correct_answer

            # Compute accuracy for this agent and append to the list
            accurate = compute_accuracy(gt, response, task_name, strict=strict)
            if accurate is not None:
                result_accuracies[agent] = float(accurate)
                individual_agent_responses.append(response)

    # Calculate majority vote accuracy
    if individual_agent_responses:
        gt = debate_result.correct_answer
        majority_vote_acc = compute_accuracy(
            gt, individual_agent_responses, task_name, strict=strict
        )
        result_accuracies["majority_vote"] = (
            majority_vote_acc if majority_vote_acc is not None else 0.0
        )

    return result_accuracies


def evaluate_results(
    debate_results: List[DebateResult],
    num_rounds: int,
    task_name: str,
    strict: bool = False,
) -> List[Dict[str, Dict[str, float]]]:
    """
    Evaluate a list of debate results for all turns.

    Args:
        debate_results: List of DebateResult objects
        num_rounds: Number of debate rounds
        task_name: Name of the task domain
        strict: Whether to use strict evaluation

    Returns:
        List of performance metrics for each turn
    """
    # Get all agent names from the first result
    agent_responses = debate_results[0].debate_session.get_agent_responses()
    all_agents = list(agent_responses.keys())

    performance = []

    # Evaluate each turn
    for turn in range(num_rounds + 1):
        turn_accuracies = {"majority_vote": []}
        for agent in all_agents:
            turn_accuracies[agent] = []

        newcomer_accuracies = {}

        # Evaluate each debate result
        for debate_result in debate_results:
            result_accuracies = evaluate_single_debate_result(
                debate_result, turn, task_name, strict=strict
            )

            # Aggregate accuracies
            for agent in all_agents:
                if result_accuracies[agent] is not None:
                    turn_accuracies[agent].append(result_accuracies[agent])
                    # Track newcomer agent accuracies
                    if "newcomer" in agent and "normative_module" not in agent:
                        if agent not in newcomer_accuracies:
                            newcomer_accuracies[agent] = []
                        newcomer_accuracies[agent].append(result_accuracies[agent])

            # Add majority vote accuracy
            if result_accuracies["majority_vote"] is not None:
                turn_accuracies["majority_vote"].append(
                    result_accuracies["majority_vote"]
                )

        # Compute and print the average accuracy of each newcomer agent
        for agent in newcomer_accuracies:
            if newcomer_accuracies[agent]:
                print(
                    f"round_{turn + 1} newcomer {agent} accuracy: {np.mean(newcomer_accuracies[agent]):.2f}"
                )

        # Save out per-agent performance (average accuracies)
        round_performances = {}
        for agent in all_agents + ["majority_vote"]:
            if turn_accuracies[agent]:
                round_performances[agent] = np.mean(turn_accuracies[agent])
            else:
                round_performances[agent] = 0.0

        performance.append({f"round_{turn + 1}": round_performances})
        print(
            f"Round {turn + 1} majority-vote accuracy: {round_performances['majority_vote']:.2f}"
        )

    return performance
