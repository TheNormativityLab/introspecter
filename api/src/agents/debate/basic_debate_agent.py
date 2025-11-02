import attrs, re
from typing import List, Optional, Literal

from src.agents.base_agent import BaseAgent
from src.llm_api.base_llm_abstractions import Message


@attrs.define
class BasicDebateAgent(BaseAgent):
    summarize: bool = attrs.field(default=False)
    use_all_history: bool = attrs.field(default=False)
    num_agents: int = attrs.field(default=None)
    total_cost: float = attrs.field(default=0.0)

    domain: Literal["mmlu", "math", "commonsense_qa", "gsm8k", "custom"] = attrs.field(
        default=None
    )

    # NOTE: hardcoded for now
    instruction: str = attrs.field(default=None)
    answer_history: List[str] = attrs.field(factory=list)
    debug: bool = attrs.field(default=False)

    async def reset(self):
        """
        Reset the agent for a new debate. Now async for consistency.
        """
        # debate specific history
        self.instruction = None
        self.answer_history = []
        self.total_cost = 0

        # base agent history - call parent's async reset
        await super().reset()

    def set_instruction(self, instruction: str):
        """
        Set the instruction for the agent.
        """
        self.instruction = instruction
        self.add_to_msg_history(Message(role="user", content=self.instruction))

    async def completion(self) -> str:
        """
        Use the LLM while treating this as Instruction following task.
        For human agents, this should not be called.
        """
        if self.llm is None:
            raise RuntimeError(f"Agent {self.name} is a human agent and cannot use LLM completion")
        
        response = await self.chat_completion()

        # Extract the completion text from the response
        response_text = response.completion
        self.total_cost += response.cost

        # Add the response to the message history
        self.add_to_msg_history(Message(role="assistant", content=response_text))

        return response_text

    def get_total_cost(self) -> float:
        """
        Get the total cost incurred by this agent
        """
        return self.total_cost

    async def act(self):
        raise NotImplementedError(
            "MMLUDebateAgent does not implement act because there is no environment"
        )

    async def summarize_other_agents(self, agent_responses: List[str]):
        """
        Summarize the responses from other agents, and return the summary
        via the instruction completion API.
        
        FIXED: Handles missing summarization_message_initial/final keys gracefully.
        """
        if self.llm is None:
            raise RuntimeError(f"Agent {self.name} is a human agent and cannot summarize")
        
        partials = self.config.prompt_config.partials
        
        # Check if required keys exist, provide defaults if not
        if "summarization_message_initial" in partials:
            summarization_message = partials["summarization_message_initial"]
        else:
            # Provide a sensible default
            summarization_message = (
                "Please provide a concise summary of the following agent responses. "
                "Focus on key points and any areas of agreement or disagreement:"
            )

        for agent_response in agent_responses:
            summarization_message += "\n\n One agent response: ```{}```".format(
                agent_response
            )

        # Check for final message part
        if "summarization_message_final" in partials:
            summarization_message += "\n\n " + partials["summarization_message_final"]
        else:
            # Provide a sensible default
            summarization_message += (
                "\n\n Please provide your summary now, highlighting the main points "
                "and any significant differences in approach or conclusions."
            )

        response = await self.instruction_completion(payload=summarization_message)
        response_text = response.completion
        return response_text

    async def generate_answer(self):
        """
        Generate answer for LLM agents. For human agents, this should not be called directly.
        """
        if self.llm is None:
            raise RuntimeError(
                f"Agent {self.name} is a human agent. Use orchestrator's "
                "_generate_agent_response() instead which handles human input."
            )
        
        answer = await self.completion()
        self.answer_history.append(answer)

        # If debug is true, print the message history
        if self.debug:
            self.print_msg_history()

        return answer

    async def extract_answer_from_response(self, response: str) -> str:
        """
        Extract the final answer from a model response.
        Handles math-style boxed answers, natural-language answers,
        and short custom question responses more robustly.
        """
        if not response:
            return ""
        import re
        
        # CRITICAL: Check for #### pattern first (used in math problem answers)
        final_answer_match = re.search(r'####\s*([+-]?\d+\.?\d*)', response)
        if final_answer_match:
            return final_answer_match.group(1).strip()
        
        # Check for (X) patterns (multiple choice)
        final_answer_patterns = [
            r'\(X\)\s*([A-E])\)',           # (X) C)
            r'\(X\)\s*\(([A-E])\)',         # (X) (C)
            r'\(X\)\s*([A-E])(?:\s|$)',     # (X) C at end or followed by space
        ]
        
        for pattern in final_answer_patterns:
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                return match.group(1).strip().upper()
        
        # Check for boxed answers
        boxed_match = re.search(r'\\boxed\{([^}]+)\}', response)
        if boxed_match:
            return boxed_match.group(1).strip()
        
        # Other patterns
        patterns = [
            r'(?:the )?(?:final )?answer is[:\s]+\(?([A-E])\)?',
            r'(?:the )?(?:final )?answer is[:\s]+([^\n\.]+)',
            r'(?:equals?|is|=)\s*([+-]?\d+\.?\d*)',
            r'(?:therefore|thus|so)[,\s]+(?:the answer is )?\s*([^\n\.]+)',
            r'\(([A-E])\)\s*$',
            r'([+-]?\d+\.?\d*)\s*$',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                answer = match.group(1).strip()
                # Clean up trailing punctuation
                return answer.rstrip('.,;: ')
        
        sentences = [s.strip() for s in response.split('.') if s.strip()]
        if sentences:
            return sentences[-1][:100]
        
        return response[:100]

    async def add_discussion_with_other_agents_in_context(
        self,
        agent_responses: List[str],
        summarize: bool = False,
        additional_context: Optional[str] = None,
    ) -> None:
        """
        Add discussion context. For human agents, this just stores context without LLM calls.
        """
        if self.llm is None:
            other_agent_responses = ""
            for agent_response in agent_responses:
                other_agent_responses += "\n\n One agent response: ```{}```".format(
                    agent_response
                )
            payload = f"Other agents' responses:\n{other_agent_responses}"
            self.add_to_msg_history(Message(role="user", content=payload))
            return
        
        if summarize:
            other_agent_responses = await self.summarize_other_agents(agent_responses)
        else:
            other_agent_responses = ""
            for agent_response in agent_responses:
                other_agent_responses += "\n\n One agent response: ```{}```".format(
                    agent_response
                )
        
        if "discussion_message" not in self.config.prompt_config.partials:
            if self.domain in ["mmlu", "commonsense_qa"]:
                payload = f"Here are the responses from other agents:\n\n{other_agent_responses}\n\nPlease consider these responses and provide your updated answer."
            else:
                payload = f"Question: {additional_context or ''}\n\nHere are the responses from other agents:\n\n{other_agent_responses}\n\nPlease consider these responses and provide your updated answer."
        elif self.domain in ["mmlu", "commonsense_qa"]:
            payload = self.config.prompt_config.partials["discussion_message"].format(
                AGENT_RESPONSES=other_agent_responses
            )
        elif self.domain in ["math", "gsm8k", "custom"]:
            payload = self.config.prompt_config.partials["discussion_message"].format(
                AGENT_RESPONSES=other_agent_responses,
                QUESTION_PROMPT=additional_context or "",
            )
        else:
            payload = self.config.prompt_config.partials["discussion_message"].format(
                AGENT_RESPONSES=other_agent_responses,
                QUESTION_PROMPT=additional_context or "",
            )
        self.add_to_msg_history(Message(role="user", content=payload))

    def latest_response(self) -> str:
        """
        Get the latest response from the agent.
        """
        return self.answer_history[-1]

    def latest_query(self) -> str:
        """
        Get the latest query from the agent.
        """
        for message in reversed(self.msg_history):
            if message.role == "user":
                return message.content
        return ""