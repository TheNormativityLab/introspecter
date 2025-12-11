CREATE TABLE IF NOT EXISTS debates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    debate_type VARCHAR(100) NOT NULL,
    config JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    total_questions INT NOT NULL,
    completed_questions INT DEFAULT 0,
    performance_data JSONB DEFAULT '{}',
    wandb_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    celery_task_id VARCHAR(255)
);


CREATE INDEX IF NOT EXISTS idx_debates_status ON debates(status);
CREATE INDEX IF NOT EXISTS idx_debates_debate_type ON debates(debate_type);
CREATE INDEX IF NOT EXISTS idx_debates_celery_task_id ON debates(celery_task_id) WHERE celery_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debates_performance_data ON debates USING GIN (performance_data);
CREATE INDEX IF NOT EXISTS idx_debates_wandb_metadata ON debates USING GIN (wandb_metadata);

CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id INT NOT NULL,
    question_text TEXT UNIQUE NOT NULL,
    question_prompt TEXT,
    correct_answer TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_question_id ON questions(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_question_text ON questions(question_text);

CREATE TABLE IF NOT EXISTS question_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    total_rounds INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    celery_task_id VARCHAR(255),
    
    UNIQUE(debate_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_sessions_debate_id ON question_sessions(debate_id);
CREATE INDEX IF NOT EXISTS idx_question_sessions_status ON question_sessions(status);
CREATE INDEX IF NOT EXISTS idx_question_sessions_celery_task_id ON question_sessions(celery_task_id) WHERE celery_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_session_id UUID NOT NULL REFERENCES question_sessions(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    majority_vote FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(question_session_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_rounds_question_session_id ON rounds(question_session_id);

CREATE TABLE IF NOT EXISTS agent_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    agent_index INT NOT NULL,
    model_name VARCHAR(255),
    response_text TEXT NOT NULL,
    extracted_answer TEXT,
    is_correct BOOLEAN,
    is_human BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(round_id, agent_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_responses_round_id ON agent_responses(round_id);
CREATE INDEX IF NOT EXISTS idx_agent_responses_model_name ON agent_responses(model_name);
CREATE INDEX IF NOT EXISTS idx_agent_responses_is_correct ON agent_responses(is_correct) WHERE is_correct IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_responses_is_human ON agent_responses(is_human);