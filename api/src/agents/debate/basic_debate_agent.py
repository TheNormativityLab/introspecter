import logging
import re
from typing import List, Dict, Any, Optional

from omegaconf import DictConfig, ListConfig

from src.agents.base_agent import BaseAgent, AgentConfig

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


class BasicDebateAgent(BaseAgent):
    def __init__(
        self,
        config: AgentConfig,
        num_agents: int = 2,
        domain: str = "unknown",
        debug: bool = False
    ):
        super().__init__(config)
        self.num_agents = num_agents
        self.domain = domain
        self.debug = debug
        self.discussion_context: List[str] = []
    
    async def completion(self) -> str:
        response = await self.chat_completion()
        
        if hasattr(response, 'choices') and response.choices:
            content = response.choices[0].message.content
        elif isinstance(response, dict):
            response = _deep_convert_to_python(response)
            content = response.get('choices', [{}])[0].get('message', {}).get('content', '')
        else:
            content = str(response)
        
        return content
    
    async def generate_answer(self) -> str:
        if not self.llm:
            return "[Human participant - awaiting response]"
        
        try:
            answer = await self.completion()
            self.answer_history.append(answer)
            self.add_message("assistant", answer)
            return answer
        except Exception as e:
            logger.error(f"Error generating answer for {self.name}: {e}")
            raise
    
    async def add_discussion_with_other_agents_in_context(
        self,
        other_answers: List[str],
        summarize: bool = True,
        additional_context: Optional[str] = None
    ):
        if not other_answers:
            return
        
        other_answers = _deep_convert_to_python(other_answers)
        
        discussion_text = "\n\n---\n\n".join([
            f"Agent {i+1}'s response:\n{answer}"
            for i, answer in enumerate(other_answers)
        ])
        
        context_message = f"Here are the other agents' responses from the previous round:\n\n{discussion_text}"
        
        if additional_context:
            context_message += f"\n\nAdditional context:\n{additional_context}"
        
        context_message += "\n\nPlease consider these responses and provide your updated answer."
        
        self.discussion_context.append(context_message)
        self.add_message("user", context_message)
    
    async def extract_answer_from_response(self, response: str) -> str:
        if not response:
            return ""
        
        patterns = [
            r'####\s*([+-]?\d+\.?\d*)',
            r'\(X\)\s*([A-E])\)',
            r'\(X\)\s*\(([A-E])\)',
            r'\(X\)\s*([A-E])(?:\s|$)',
            r'\\boxed\{([^}]+)\}',
            r'(?:the )?(?:final )?answer is[:\s]+\(?([A-E])\)?',
            r'(?:the )?(?:final )?answer is[:\s]+([^\n\.]+)',
            r'(?:equals?|is|=)\s*([+-]?\d+\.?\d*)',
            r'\(([A-E])\)\s*$',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        sentences = [s.strip() for s in response.split('.') if s.strip()]
        if sentences:
            return sentences[-1][:100]
        
        return response[:100]
    
    async def reset(self):
        await super().reset()
        self.discussion_context = []