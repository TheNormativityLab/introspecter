import attrs
from abc import ABC, abstractmethod
import random
from typing import Callable, Optional
from src.normative_modules.base_normative_module import NormativeModule
from src.agents.debate.basic_debate_agent import BasicDebateAgent


@attrs.define
class CommunityDebateAgent(BasicDebateAgent):
    """Base class for community debate agents with common functionality."""

    @abstractmethod
    def get_response(self, message_from_other_agent: str) -> str:
        """
        Get the response based on the message heard from the other agent.
        """
        pass


@attrs.define
class BackgroundCommunityDebateAgent(CommunityDebateAgent):
    _normative_criteria_fn: Callable[[str], bool] | None = attrs.field(default=None)
    reasoning_responses: list = attrs.field(default="No response.")

    def set_normative_criteria_fn(self, fn: Callable[[str], bool]) -> None:
        """Set the normative criteria function after initialization."""
        self._normative_criteria_fn = fn

    def check_normative_criteria(self, message: str) -> bool:
        """Check if the message satisfies the normative criteria."""
        if self._normative_criteria_fn is None:
            return True  # default behavior
        return self._normative_criteria_fn(message)
    
    def set_reasoning_response(self, responses):
        self.reasoning_responses = responses

    def generate_reasoning_response(self, message: str) -> str:
        """
        Generate a reasoning response to the message violating the normative criteria. 
        """
        return random.choice(self.reasoning_responses)

    def get_response(
        self,
        latest_message_from_other_agent: str,
    ) -> str:
        """
        If latest_message satisfies the normative criteria, i.e., part of the community,
            then give the actual last response.
        Else, give the reasoning response.
        """
        if self.check_normative_criteria(latest_message_from_other_agent):
            return self.latest_response()
        else:
            return self.generate_reasoning_response(latest_message_from_other_agent)


@attrs.define
class NewcomerCommunityDebateAgent(CommunityDebateAgent):
    normative_module: Optional[NormativeModule] = attrs.field(default=None)

    def set_normative_module(self, module: NormativeModule):
        """
        Set the normative module after initialization.
        """
        self.normative_module = module

    async def get_response(self, latest_message_from_other_agent: str) -> str:
        """
        v0: Start with doing nothing ie ignore the latest message from other agent, and return the response
        v1: Use the normative module to do the normative reasoning for the newcomer agent.
        """
        # v0
        # NOTE: newcomer doesn't have info about the normative criteria, so it returns it's latest response
        if self.normative_module is None:
            return self.latest_response()
        # Update normative module with the latest messages
        await self.normative_module.identify_normative_criteria(self.msg_history)
        # Return the response with the normative module applied
        normative_response = await self.normative_module.apply_normative_criteria(self.latest_response())
        return normative_response
