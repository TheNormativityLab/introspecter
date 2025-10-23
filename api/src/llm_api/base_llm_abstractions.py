"""
Part of code taken from https://github.com/ucl-dark/llm_debate/tree/main
"""

import logging
from enum import Enum, auto
from typing import Dict, List, Optional, Protocol, Literal, Tuple, Any

import attrs
from pydantic import BaseModel, Field
from omegaconf import DictConfig

# TODO: do logging via hydra!
PRINT_COLORS = {"user": "cyan", "system": "magenta", "assistant": "light_green"}
LOGGER = logging.getLogger(__name__)

# prompt tags
HUMAN_PROMPT = "\n\nHuman:"
AI_PROMPT = "\n\nAssistant:"


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


# TODO: rewrite this to be simpler
class PromptConfig(BaseModel):
    # prompt config methods to read from prompt and transform into all the prompts that agents need for initializat
    system_prompt: str = Field(default="")
    partials: Dict[str, str] = Field(default_factory=dict)

    @classmethod
    def from_hydra_config(cls, config: DictConfig):
        return cls(
            system_prompt=config.system_prompt,
            partials=dict(config.partials),
        )


class LanguageModelConfig(BaseModel):
    model_name: str
    litellm_params: Dict[str, Any] = Field(
        default_factory=dict, description="Parameters passed directly to litellm"
    )

    @classmethod
    def from_hydra_config(cls, config: DictConfig):
        return cls(
            model_name=config.model_name,
            litellm_params=dict(config.litellm_params),
        )


class LLMConfig(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    language_models: List[LanguageModelConfig]
    completion_params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Global completion parameters that apply to all models",
    )

    @classmethod
    def from_hydra_config(cls, config: DictConfig):
        return cls(
            language_models=[
                LanguageModelConfig.from_hydra_config(model_config)
                for model_config in config.language_models
            ],
            completion_params=dict(config.completion_params),
        )


class LLMResponse(BaseModel):
    """
    https://docs.litellm.ai/docs/completion/output
    """

    model: str  # TODO: remove this
    completion: str  # message content
    stop_reason: str

    prompt_tokens: Optional[int] = None  # Input tokens
    completion_tokens: Optional[int] = None  # Output tokens
    total_tokens: Optional[int] = None  # Total tokens

    # Not supported yet
    cost: Optional[float] = None
    duration: Optional[float] = None
    api_duration: Optional[float] = None
    logprobs: Optional[List[Dict[str, float]]] = None
