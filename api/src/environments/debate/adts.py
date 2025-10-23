# src/environments/debate/structures.py
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any, Union


class DebateRound(BaseModel):
    """A single round of debate with agent responses"""

    round_number: int
    responses: Dict[str, str] = Field(
        default_factory=dict
    )  # agent_name -> response from LLM
    queries: Optional[Dict[str, str]] = Field(
        default=None
    )  # agent_name -> query from LLM
    # TODO: do we need to store reasoning and answer separately?

    def add_response(self, agent_name: str, response: str) -> None:
        self.responses[agent_name] = response

    def add_query(self, agent_name: str, query: str) -> None:
        self.queries[agent_name] = query


class DebateProcedureResult(BaseModel):
    """Store the history of a debate session"""

    rounds: List[DebateRound] = Field(default_factory=list)

    def add_round(self, round_obj: DebateRound) -> None:
        self.rounds.append(round_obj)

    def get_current_round(self) -> Optional[DebateRound]:
        """Get the most recent round"""
        if not self.rounds:
            return None
        return self.rounds[-1]

    def get_agent_responses(self) -> Dict[str, List[str]]:
        """Get all responses for each agent across all rounds"""
        agent_response = {}

        if self.rounds:
            # Get all agent names from all rounds
            agent_names = set()
            for round_obj in self.rounds:
                agent_names.update(round_obj.responses.keys())

            # For each agent, collect their responses across all rounds
            for agent_name in agent_names:
                agent_response[agent_name] = [
                    round_obj.responses.get(agent_name, "") for round_obj in self.rounds
                ]

        return agent_response


class DebateResult(BaseModel):
    """Complete results of a debate session"""

    # metadata
    question_id: int
    question: str
    correct_answer: str
    question_prompt: Optional[str] = None
    # actual debate procedure result
    debate_session: DebateProcedureResult

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert to format expected by existing functions

        Weird return format because it maintains backward compatibility with existing code
        """
        return {
            "question_id": self.question_id,
            "question": self.question,
            "agent_response": self.debate_session.get_agent_responses(),
            "answer": self.correct_answer,
            "question_prompt": self.question_prompt,
        }
