import os
from contextlib import asynccontextmanager
from typing import Optional
from datetime import datetime
import uuid

from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, Float, ForeignKey, Index
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

Base = declarative_base()


class Debate(Base):
    __tablename__ = "debates"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    debate_type = Column(String(100), nullable=False)
    config = Column(JSONB, nullable=False)
    
    status = Column(String(50), nullable=False, default='queued')
    
    total_questions = Column(Integer, nullable=False)
    completed_questions = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    
    celery_task_id = Column(String(255))
    performance_data = Column(JSONB, default=dict)
    wandb_metadata = Column(JSONB, default=dict)
    
    question_sessions = relationship("QuestionSession", back_populates="debate", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_debates_status', 'status'),
        Index('idx_debates_debate_type', 'debate_type'),
        Index('idx_debates_celery_task_id', 'celery_task_id'),
    )


class Question(Base):
    __tablename__ = "questions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id = Column(Integer, nullable=False) 
    question_text = Column(Text, nullable=False, unique=True) 
    question_prompt = Column(Text)
    correct_answer = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    question_sessions = relationship("QuestionSession", back_populates="question")
    
    __table_args__ = (
        Index('idx_questions_question_id', 'question_id'),
    )


class QuestionSession(Base):
    __tablename__ = "question_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    debate_id = Column(UUID(as_uuid=True), ForeignKey('debates.id', ondelete='CASCADE'), nullable=False)
    question_id = Column(UUID(as_uuid=True), ForeignKey('questions.id', ondelete='RESTRICT'), nullable=False)
    
    status = Column(String(50), nullable=False, default='queued')    
    total_rounds = Column(Integer, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    
    celery_task_id = Column(String(255))
    
    debate = relationship("Debate", back_populates="question_sessions")
    question = relationship("Question", back_populates="question_sessions")
    rounds = relationship("Round", back_populates="question_session", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_question_sessions_debate_id', 'debate_id'),
        Index('idx_question_sessions_status', 'status'),
        Index('idx_question_sessions_celery_task_id', 'celery_task_id'),
    )


class Round(Base):
    __tablename__ = "rounds"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_session_id = Column(UUID(as_uuid=True), ForeignKey('question_sessions.id', ondelete='CASCADE'), nullable=False)
    round_number = Column(Integer, nullable=False)
    majority_vote = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    question_session = relationship("QuestionSession", back_populates="rounds")
    agent_response_records = relationship("AgentResponse", back_populates="round", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_rounds_question_session_id', 'question_session_id'),
    )


class AgentResponse(Base):
    __tablename__ = "agent_responses"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id = Column(UUID(as_uuid=True), ForeignKey('rounds.id', ondelete='CASCADE'), nullable=False)
    
    agent_index = Column(Integer, nullable=False)
    model_name = Column(String(255))
    
    response_text = Column(Text, nullable=False)
    extracted_answer = Column(Text)
    is_correct = Column(Boolean)
    is_human = Column(Boolean, default=False, nullable=False) 
    created_at = Column(DateTime, default=datetime.utcnow)
    
    round = relationship("Round", back_populates="agent_response_records")
    
    __table_args__ = (
        Index('idx_agent_responses_round_id', 'round_id'),
        Index('idx_agent_responses_model_name', 'model_name'),
        Index('idx_agent_responses_is_correct', 'is_correct'),
    )


class DatabaseManager:
    def __init__(self, database_url: Optional[str] = None):
        if database_url is None:
            database_url = os.getenv("DATABASE_URL")
            if not database_url:
                raise ValueError("DATABASE_URL environment variable not set")
        
        # Convert postgres:// to postgresql+asyncpg:// if needed
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        
        self.engine = create_async_engine(database_url, echo=False)
        self.async_session_maker = async_sessionmaker(
            self.engine, 
            class_=AsyncSession, 
            expire_on_commit=False
        )
    
    @asynccontextmanager
    async def get_session(self):
        """Get an async database session."""
        async with self.async_session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    
    async def create_tables(self):
        """Create all tables."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    
    async def close(self):
        """Close the database connection."""
        await self.engine.dispose()