import json
import numpy as np
import re
import argparse
import os
from typing import List


def args_parse():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--result_location",
        "-i",
        type=str,
        help="The location of the results to evaluate",
    )
    parser.add_argument(
        "--num_agents",
        "-n",
        default=2,
        type=int,
        help="The number of agents in the debate",
    )
    parser.add_argument(
        "--num_rounds",
        "-r",
        default=3,
        type=int,
        help="The number of rounds in the debate",
    )
    parser.add_argument("--agent_name", default="debate_agent", type=str)
    parser.add_argument(
        "--strict", action="store_true", help="Whether to use strict accuracy"
    )
    return parser.parse_args()


def parse_answer(input_str):
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


def compute_accuracy(gt, pred_solutions, strict=False):
    if type(pred_solutions) == list:
        pred_answers = []

        for pred_solution in pred_solutions:
            pred_answer = parse_answer(pred_solution)

            if pred_answer is not None:
                pred_answers.append(pred_answer)

        if len(pred_answers) == 0:
            return 0

        pred_answer = answer_check(pred_answers, float(gt), strict=strict)
    else:
        #  TODO: for single agent???
        pred_answer = parse_answer(pred_solutions)

    return pred_answer


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


def most_frequent(answers: List[str]):
    counter = 0
    num = answers[0]

    for i in answers:
        current_frequency = answers.count(i)
        if current_frequency > counter:
            counter = current_frequency
            num = i

    return num


if __name__ == "__main__":
    args = args_parse()

    with open(args.result_location, "r") as f:
        response_dict = json.load(f)

    questions = [response_dict[i]["question"] for i in range(len(response_dict))]

    # TODO: add this info in the metadata and load it directly from there
    agents = [f"{args.agent_name}_{i}" for i in range(args.num_agents)]

    performance = []

    for turn in range(args.num_rounds + 1):
        accuracies = []
        for idx in range(len(questions)):
            responses = [
                response_dict[idx]["agent_response"][agent][turn] for agent in agents
            ]
            gt = response_dict[idx]["answer"]

            accurate = compute_accuracy(gt, responses, strict=args.strict)

            if accurate is not None:
                accuracies.append(float(accurate))
            else:
                accuracies.append(0.0)

        performance.append({f"{turn+1}_performance": np.mean(accuracies)})
        print(
            f"Round {turn+1} performance: {performance[-1][f'{turn+1}_performance']:.2f}"
        )

    # Create output directory if it doesn't exist
    output_dir = "/".join(args.result_location.split("/")[:-1])
    save_file_path = os.path.join(output_dir, "performance.json")

    print(f"The performance file '{save_file_path}' is saving...")

    try:
        with open(save_file_path, "x") as f:
            json.dump(performance, f, indent=4)
    except FileExistsError:
        print(f"Warning: Overwriting existing file at {save_file_path}")
        with open(save_file_path, "w") as f:
            json.dump(performance, f, indent=4)

    print("All done!!")
