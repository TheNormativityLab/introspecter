import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from omegaconf import DictConfig, ListConfig

from src.llm_api.base_llm_abstractions import PromptConfig, LLMConfig
from src.llm_api.llm import LLM

logger = logging.getLogger(__name__)


def _deep_convert_to_python(obj: Any) -> Any:
    if isinstance(obj, DictConfig):
        return {k: _deep_convert_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, ListConfig):
        return [_deep_convert_to_python(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: _deep_convert_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_deep_convert_to_python(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(_deep_convert_to_python(item) for item in obj)
    else:
        return obj


@dataclass
class AgentConfig:
    prompt_config: PromptConfig
    llm_config: Optional[LLMConfig] = None
    name: str = "agent"
    
    def __post_init__(self):
        if self.prompt_config and hasattr(self.prompt_config, 'partials'):
            self.prompt_config.partials = _deep_convert_to_python(self.prompt_config.partials)


class BaseAgent:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.name = config.name
        self.llm: Optional[LLM] = None
        self.msg_history: List[Dict[str, str]] = []
        self.answer_history: List[str] = []
        self._instruction: str = ""
    
    async def build(self):
        if self.config.llm_config:
            self.llm = LLM(self.config.llm_config)
    
    async def reset(self):
        self.msg_history = []
        self.answer_history = []
        self._instruction = ""
        
        if self.config.prompt_config and self.config.prompt_config.system_prompt:
            self.msg_history.append({
                "role": "system",
                "content": self.config.prompt_config.system_prompt
            })
    
    def set_instruction(self, instruction: str):
        self._instruction = instruction
        if self.msg_history and self.msg_history[-1].get("role") == "user":
            self.msg_history[-1]["content"] = instruction
        else:
            self.msg_history.append({
                "role": "user", 
                "content": instruction
            })
    
    def add_message(self, role: str, content: str):
        self.msg_history.append({
            "role": role,
            "content": content
        })
    
    def latest_response(self) -> str:
        if self.answer_history:
            return self.answer_history[-1]
        return ""
    
    async def chat_completion(self) -> Any:
        if not self.llm:
            raise ValueError(f"Agent {self.name} has no LLM configured")
        
        messages = _deep_convert_to_python(self.msg_history)
        return await self.llm(messages=messages)
    
    async def generate_answer(self) -> str:
        raise NotImplementedError("Subclasses must implement generate_answer")
    
    async def extract_answer_from_response(self, response: str) -> str:
        return response