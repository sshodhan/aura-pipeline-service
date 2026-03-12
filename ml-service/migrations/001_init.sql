-- AURA ML Service: Initial Database Schema
-- PostgreSQL 15+

-- User feedback table: stores all user interactions with outfit recommendations
CREATE TABLE IF NOT EXISTS user_feedback (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    outfit_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('liked', 'disliked', 'saved', 'shared', 'skipped')),
    context JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON user_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_outfit ON user_feedback(outfit_id);
CREATE INDEX IF NOT EXISTS idx_feedback_action ON user_feedback(action);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON user_feedback(created_at DESC);

-- Model artifact tracking: records each trained model version
CREATE TABLE IF NOT EXISTS model_artifacts (
    id BIGSERIAL PRIMARY KEY,
    model_type VARCHAR(50) NOT NULL,
    version VARCHAR(50) NOT NULL,
    train_metrics JSONB,
    artifact_path VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(model_type, version)
);

CREATE INDEX IF NOT EXISTS idx_model_type_version ON model_artifacts(model_type, created_at DESC);
