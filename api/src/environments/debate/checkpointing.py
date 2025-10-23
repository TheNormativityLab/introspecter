import os
from omegaconf import OmegaConf, DictConfig
from typing import Optional, List, Dict, Any, Tuple
from src.environments.debate.utils import DebateResult
import datetime
import json


def ensure_checkpoint_dir(checkpoint_dir: str) -> None:
    """Ensure the checkpoint directory exists."""
    os.makedirs(checkpoint_dir, exist_ok=True)


def checkpoint_exists(checkpoint_dir: str) -> bool:
    """Check if a checkpoint exists in the given directory."""
    checkpoint_file = os.path.join(checkpoint_dir, "checkpoint.json")
    return os.path.exists(checkpoint_file)


def create_checkpoint_dir(
    experiment_id: str, checkpoint_dir: str, config: DictConfig
) -> str:
    """Initialize checkpoint directory and save config."""
    # Create checkpoint directory
    checkpoint_path = os.path.join(checkpoint_dir, experiment_id)
    os.makedirs(checkpoint_path, exist_ok=True)

    # Save config
    config_path = os.path.join(checkpoint_path, "config.yaml")
    OmegaConf.save(config=config, f=config_path)

    return checkpoint_path


def save_config(checkpoint_dir: str, config: DictConfig) -> None:
    """Save configuration to checkpoint directory."""
    config_path = os.path.join(checkpoint_dir, "config.yaml")
    OmegaConf.save(config=config, f=config_path)


def save_checkpoint(
    results: List[DebateResult],
    next_question_idx: int,
    config: DictConfig,
    checkpoint_dir: str,
) -> None:
    """
    Save current experiment state to checkpoint.

    Args:
        results: List of debate results processed so far
        next_question_idx: Index of the next question to process
        config: Experiment configuration
        checkpoint_dir: Directory to store checkpoints
    """
    # Ensure checkpoint directory exists
    ensure_checkpoint_dir(checkpoint_dir)

    # Serialize debate results
    serialized_results = [result.model_dump() for result in results]

    # Create checkpoint metadata
    checkpoint_data = {
        "next_question_idx": next_question_idx,
        "total_questions": config.experiment.num_questions,
        "timestamp": str(datetime.datetime.now()),
        "task_name": config.task.name,
    }

    # Save files with atomic write (using temp files)
    # First save results to a temporary file
    temp_results_file = os.path.join(checkpoint_dir, "results.json.tmp")
    with open(temp_results_file, "w") as f:
        json.dump(serialized_results, f, indent=2)

    # Then save checkpoint data
    temp_checkpoint_file = os.path.join(checkpoint_dir, "checkpoint.json.tmp")
    with open(temp_checkpoint_file, "w") as f:
        json.dump(checkpoint_data, f, indent=2)

    # Save config if it doesn't exist yet
    config_path = os.path.join(checkpoint_dir, "config.yaml")
    if not os.path.exists(config_path):
        save_config(checkpoint_dir, config)

    # Save wandb metadata if available
    try:
        import wandb

        if wandb.run is not None:
            wandb_metadata_file = os.path.join(checkpoint_dir, "wandb_metadata.json")
            with open(wandb_metadata_file, "w") as f:
                json.dump({"run_id": wandb.run.id}, f)
    except Exception as e:
        print(f"Warning: Could not save wandb metadata: {e}")

    # Rename temp files to final files (atomic operation)
    results_file = os.path.join(checkpoint_dir, "results.json")
    checkpoint_file = os.path.join(checkpoint_dir, "checkpoint.json")

    os.replace(temp_results_file, results_file)
    os.replace(temp_checkpoint_file, checkpoint_file)

    print(f"\nCheckpoint saved: {checkpoint_dir}")
    print(f"Progress: {next_question_idx}/{config.experiment.num_questions} questions")


def load_checkpoint(checkpoint_dir: str) -> Tuple[List[DebateResult], int, DictConfig]:
    """
    Load previous experiment state from checkpoint.

    Args:
        checkpoint_dir: Directory where checkpoints are stored

    Returns:
        Tuple containing:
        - List of previously processed debate results
        - Index of the last processed question
        - Loaded configuration

    Raises:
        FileNotFoundError: If checkpoint files don't exist
    """
    # Check if checkpoint exists
    if not os.path.exists(checkpoint_dir):
        raise FileNotFoundError(f"Checkpoint directory not found: {checkpoint_dir}")

    # Load checkpoint data
    checkpoint_file = os.path.join(checkpoint_dir, "checkpoint.json")
    if not os.path.exists(checkpoint_file):
        raise FileNotFoundError(f"Checkpoint file not found: {checkpoint_file}")

    with open(checkpoint_file, "r") as f:
        checkpoint_data = json.load(f)

    # Load results
    results_file = os.path.join(checkpoint_dir, "results.json")
    if not os.path.exists(results_file):
        raise FileNotFoundError(f"Results file not found: {results_file}")

    with open(results_file, "r") as f:
        serialized_results = json.load(f)

    # Deserialize results
    results = [DebateResult.model_validate(result) for result in serialized_results]

    # Load config
    config_file = os.path.join(checkpoint_dir, "config.yaml")
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"Config file not found: {config_file}")

    config = OmegaConf.load(config_file)

    return results, checkpoint_data["next_question_idx"], config
