from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
from sqlalchemy import Integer, select, update, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
import logging
from .database import Debate, Question, QuestionSession, Round, AgentResponse

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

logger = logging.getLogger(__name__)


class DebateRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_debate(
        self,
        name: str,
        debate_type: str,
        config: Dict[str, Any],
        total_questions: int,
        performance_data: Optional[Dict[str, Any]] = None,
        wandb_metadata: Optional[Dict[str, Any]] = None
    ) -> Debate:
        debate = Debate(
            name=name,
            debate_type=debate_type,
            config=config,
            total_questions=total_questions,
            status='running',
            started_at=datetime.utcnow(),
            performance_data=performance_data or {},
            wandb_metadata=wandb_metadata or {}
        )
        self.session.add(debate)
        await self.session.flush()
        await self.session.refresh(debate)
        return debate

    async def get_debate(self, debate_id: uuid.UUID) -> Optional[Debate]:
        result = await self.session.execute(
            select(Debate).where(Debate.id == debate_id)
        )
        return result.scalar_one_or_none()

    async def update_debate_progress(self, debate_id: uuid.UUID, completed_questions: int):
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(completed_questions=completed_questions)
        )
        await self.session.commit()

    async def update_debate_performance_data(self, debate_id: uuid.UUID, performance_data: Dict[str, Any]):
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(performance_data=performance_data)
        )
        await self.session.commit()

    async def update_wandb_metadata(self, debate_id: uuid.UUID, wandb_metadata: Dict[str, Any]):
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(wandb_metadata=wandb_metadata)
        )
        await self.session.commit()

    async def complete_debate(self, debate_id: uuid.UUID):
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(status='completed', completed_at=datetime.utcnow())
        )
        await self.session.commit()

    async def get_question_by_text(self, question_text: str) -> Optional[Question]:
        stmt = select(Question).where(Question.question_text == question_text)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_create_question(
        self,
        question_id: int,
        question_text: str,
        correct_answer: str,
        question_prompt: Optional[str] = None
    ) -> Question:
        stmt = select(Question).where(Question.question_text == question_text)
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            return existing

        question = Question(
            question_id=question_id,
            question_text=question_text,
            correct_answer=correct_answer,
            question_prompt=question_prompt
        )
        self.session.add(question)
        await self.session.flush()
        return question

    async def create_question_session(
        self,
        debate_id: uuid.UUID,
        question_id: uuid.UUID,
        total_rounds: int
    ) -> QuestionSession:
        question_session = QuestionSession(
            debate_id=debate_id,
            question_id=question_id,
            total_rounds=total_rounds,
            status="in_progress",
            started_at=datetime.utcnow()
        )
        self.session.add(question_session)
        await self.session.flush()

        if question_session.id is None:
            raise RuntimeError("Failed to create question session - ID not assigned")

        return question_session

    async def get_question_session_by_debate_and_question(
        self,
        debate_id: uuid.UUID,
        question_id: uuid.UUID
    ) -> Optional[QuestionSession]:
        stmt = select(QuestionSession).where(
            QuestionSession.debate_id == debate_id,
            QuestionSession.question_id == question_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_question_session_status(self, session_id: uuid.UUID, status: str):
        await self.session.execute(
            update(QuestionSession)
            .where(QuestionSession.id == session_id)
            .values(status=status)
        )

    async def complete_question_session(self, session_id: uuid.UUID):
        await self.session.execute(
            update(QuestionSession)
            .where(QuestionSession.id == session_id)
            .values(status='completed', completed_at=datetime.utcnow())
        )
        await self.session.commit()

    async def create_round(
        self,
        question_session_id: uuid.UUID,
        round_number: int,
        majority_vote: float
    ) -> Round:
        round_obj = Round(
            question_session_id=question_session_id,
            round_number=round_number,
            majority_vote=majority_vote
        )
        self.session.add(round_obj)
        await self.session.flush()
        return round_obj

    async def create_agent_response(
        self,
        round_id: uuid.UUID,
        agent_index: int,
        response_text: str,
        extracted_answer: Optional[str] = None,
        is_correct: Optional[bool] = None,
        model_name: Optional[str] = None,
        is_human: bool = False
    ) -> AgentResponse:
        response = AgentResponse(
            round_id=round_id,
            agent_index=agent_index,
            response_text=response_text,
            extracted_answer=extracted_answer,
            is_correct=is_correct,
            model_name=model_name,
            is_human=is_human
        )
        self.session.add(response)
        await self.session.flush()
        return response

    async def get_debate_with_sessions(self, debate_id: uuid.UUID) -> Optional[Debate]:
        result = await self.session.execute(
            select(Debate)
            .where(Debate.id == debate_id)
            .options(
                selectinload(Debate.question_sessions)
                .selectinload(QuestionSession.rounds)
                .selectinload(Round.agent_response_records)
            )
        )
        return result.scalar_one_or_none()

    async def get_question_session_with_rounds(self, session_id: uuid.UUID) -> Optional[QuestionSession]:
        result = await self.session.execute(
            select(QuestionSession)
            .where(QuestionSession.id == session_id)
            .options(
                selectinload(QuestionSession.rounds)
                .selectinload(Round.agent_response_records)
            )
        )
        return result.scalar_one_or_none()

    async def get_question_sessions(self, debate_id: uuid.UUID) -> List[QuestionSession]:
        stmt = (
            select(QuestionSession)
            .where(QuestionSession.debate_id == debate_id)
            .order_by(QuestionSession.created_at)
            .options(selectinload(QuestionSession.question))
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_rounds(self, question_session_id: uuid.UUID) -> List[Round]:
        stmt = (
            select(Round)
            .where(Round.question_session_id == question_session_id)
            .order_by(Round.round_number)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_agent_responses(self, round_id: uuid.UUID) -> List[AgentResponse]:
        stmt = (
            select(AgentResponse)
            .where(AgentResponse.round_id == round_id)
            .order_by(AgentResponse.agent_index)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update_debate_status(self, debate_id: uuid.UUID, status: str):
        stmt = (
            update(Debate)
            .where(Debate.id == debate_id)
            .values(status=status)
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def list_debates(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Debate]:
        query = select(Debate).order_by(desc(Debate.created_at))
        if status:
            query = query.where(Debate.status == status)
        query = query.limit(limit).offset(offset)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def update_debate_task_id(self, debate_id: uuid.UUID, task_id: str) -> None:
        query = select(Debate).where(Debate.id == debate_id)
        result = await self.session.execute(query)
        debate = result.scalar_one_or_none()
        if debate:
            debate.celery_task_id = task_id
            await self.session.commit()
        else:
            raise ValueError(f"Debate {debate_id} not found")

    async def get_debate_by_name(self, name: str) -> Optional[Debate]:
        query = select(Debate).where(Debate.name == name)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_rounds_with_responses(self, question_session_id: uuid.UUID) -> List[Dict[str, Any]]:
        query = select(Round).where(
            Round.question_session_id == question_session_id
        ).order_by(Round.round_number)

        result = await self.session.execute(query)
        rounds = result.scalars().all()

        rounds_data = []
        for round_obj in rounds:
            resp_query = select(AgentResponse).where(AgentResponse.round_id == round_obj.id)
            resp_result = await self.session.execute(resp_query)
            responses = resp_result.scalars().all()

            rounds_data.append({
                "round": round_obj.round_number,
                "responses": {resp.model_name: resp.response_text for resp in responses}
            })

        return rounds_data

    async def count_debates(self, status: Optional[str] = None) -> int:
        query = select(func.count(Debate.id))
        if status:
            query = query.where(Debate.status == status)
        result = await self.session.execute(query)
        return result.scalar() or 0