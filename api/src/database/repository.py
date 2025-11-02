# src/database/repository.py - Fixed imports

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
    """Repository for debate-related database operations."""
    
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
        """Create a new debate."""
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
        """Get a debate by ID."""
        result = await self.session.execute(
            select(Debate).where(Debate.id == debate_id)
        )
        return result.scalar_one_or_none()
    
    async def update_debate_progress(
        self,
        debate_id: uuid.UUID,
        completed_questions: int
    ):
        """Update debate progress."""
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(completed_questions=completed_questions)
        )
        await self.session.commit()
    
    async def update_debate_performance_data(
        self,
        debate_id: uuid.UUID,
        performance_data: Dict[str, Any]
    ):
        """Update debate performance data."""
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(performance_data=performance_data)
        )
        await self.session.commit()
    
    async def update_wandb_metadata(
        self,
        debate_id: uuid.UUID,
        wandb_metadata: Dict[str, Any]
    ):
        """Update wandb metadata."""
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(wandb_metadata=wandb_metadata)
        )
        await self.session.commit()

    async def complete_debate(self, debate_id: uuid.UUID):
        """Mark debate as completed."""
        await self.session.execute(
            update(Debate)
            .where(Debate.id == debate_id)
            .values(
                status='completed',
                completed_at=datetime.utcnow()
            )
        )
        await self.session.commit()
    
    async def get_question_by_text(self, question_text: str) -> Optional[Question]:
        """Get a question by its text (exact match)."""
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
        """
        Get an existing question or create a new one.
        Returns the Question object with ID populated.
        """
        logger.info(f"get_or_create_question called with question_id={question_id}")
        
        stmt = select(Question).where(Question.question_text == question_text)
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if existing:
            logger.info(f"Found existing question by text, ID: {existing.id}")
            return existing
        
        logger.info(f"Creating new question with question_id: {question_id}")
        question = Question(
            question_id=question_id,
            question_text=question_text,
            correct_answer=correct_answer,
            question_prompt=question_prompt
        )
        
        self.session.add(question)
        await self.session.flush() 
        
        logger.info(f"Created question: ID={question.id}")
        
        return question

    async def create_question_session(
        self,
        debate_id: uuid.UUID,
        question_id: uuid.UUID, 
        total_rounds: int
    ) -> QuestionSession:
        """
        Create a new question session.
        Returns the QuestionSession object with ID populated.
        """
        logger.info(f"Creating question session: debate_id={debate_id}, question_id={question_id}")
        
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
            logger.error("Question session ID is None after flush!")
            raise RuntimeError("Failed to create question session - ID not assigned")
        
        logger.info(f"Created question session: ID={question_session.id}")
        
        return question_session
    
    async def get_question_session_by_debate_and_question(
        self,
        debate_id: uuid.UUID,
        question_id: uuid.UUID 
    ) -> Optional[QuestionSession]:
        """Check if a question session already exists for this debate and question."""
        stmt = select(QuestionSession).where(
            QuestionSession.debate_id == debate_id,
            QuestionSession.question_id == question_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
    
    async def update_question_session_status(
        self,
        session_id: uuid.UUID,
        status: str
    ):
        """Update question session status."""
        await self.session.execute(
            update(QuestionSession)
            .where(QuestionSession.id == session_id)
            .values(status=status)
        )
    
    async def complete_question_session(
        self,
        session_id: uuid.UUID
    ):
        """Mark question session as completed."""
        await self.session.execute(
            update(QuestionSession)
            .where(QuestionSession.id == session_id)
            .values(
                status='completed',
                completed_at=datetime.utcnow()
            )
        )
        await self.session.commit()
    
    async def create_round(
        self,
        question_session_id: uuid.UUID,
        round_number: int,
        majority_vote: float
    ) -> Round:
        """Create a new round."""
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
        """Create an agent response record."""
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
    
    async def get_debate_with_sessions(
        self, 
        debate_id: uuid.UUID
    ) -> Optional[Debate]:
        """Get debate with all question sessions loaded."""
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
    
    async def get_question_session_with_rounds(
        self,
        session_id: uuid.UUID
    ) -> Optional[QuestionSession]:
        """Get question session with rounds and agent responses loaded."""
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
        """Get all question sessions for a debate."""
        stmt = (
            select(QuestionSession)
            .where(QuestionSession.debate_id == debate_id)
            .order_by(QuestionSession.created_at)
            .options(selectinload(QuestionSession.question))
        )
        
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def get_rounds(self, question_session_id: uuid.UUID) -> List[Round]:
        """Get all rounds for a question session."""
        stmt = (
            select(Round)
            .where(Round.question_session_id == question_session_id)
            .order_by(Round.round_number)
        )
        
        result = await self.session.execute(stmt)
        return result.scalars().all()
    
    async def get_agent_responses(self, round_id: uuid.UUID) -> List[AgentResponse]:
        """Get all agent responses for a round."""
        stmt = (
            select(AgentResponse)
            .where(AgentResponse.round_id == round_id)
            .order_by(AgentResponse.agent_index)
        )
        
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update_debate_status(self, debate_id: uuid.UUID, status: str):
        """Update debate status."""
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
        """List debates with optional filtering."""
        query = select(Debate).order_by(desc(Debate.created_at))
        
        if status:
            query = query.where(Debate.status == status)
        
        query = query.limit(limit).offset(offset)
        
        result = await self.session.execute(query)
        debates = result.scalars().all()
        
        return debates
    
    async def update_debate_task_id(
        self,
        debate_id: uuid.UUID,
        task_id: str
    ) -> None:
        """Update the Celery task ID for a debate."""
        query = select(Debate).where(Debate.id == debate_id)
        result = await self.session.execute(query)
        debate = result.scalar_one_or_none()
        
        if debate:
            debate.celery_task_id = task_id
            await self.session.commit()
        else:
            raise ValueError(f"Debate {debate_id} not found")
    
    async def get_debate_by_name(self, name: str) -> Optional[Debate]:
        """Get debate by name."""
        query = select(Debate).where(Debate.name == name)
        result = await self.session.execute(query)
        debate = result.scalar_one_or_none()
        
        return debate
    
    async def get_rounds_with_responses(
        self,
        question_session_id: uuid.UUID
    ) -> List[Dict[str, Any]]:
        """Get all rounds with their responses for a question session."""
        query = select(Round).where(
            Round.question_session_id == question_session_id
        ).order_by(Round.round_number)
        
        result = await self.session.execute(query)
        rounds = result.scalars().all()
        
        rounds_data = []
        for round_obj in rounds:
            # Get responses for this round
            resp_query = select(AgentResponse).where(
                AgentResponse.round_id == round_obj.id
            )
            resp_result = await self.session.execute(resp_query)
            responses = resp_result.scalars().all()
            
            round_data = {
                "round": round_obj.round_number,
                "responses": {
                    resp.model_name: resp.response_text
                    for resp in responses
                }
            }
            rounds_data.append(round_data)
        
        return rounds_data
    
    async def count_debates(self, status: Optional[str] = None) -> int:
        """Count total debates, optionally filtered by status."""
        query = select(func.count(Debate.id))
        
        if status:
            query = query.where(Debate.status == status)
        
        result = await self.session.execute(query)
        count = result.scalar()
        
        return count or 0