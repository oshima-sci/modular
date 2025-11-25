-- Migration: Create jobs table and RPC functions
-- Run this in your Supabase SQL editor

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending',
    job_type TEXT NOT NULL,
    payload JSONB,

    -- Claiming
    claimed_by TEXT,
    claimed_at TIMESTAMPTZ,

    -- Retry
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    retry_after TIMESTAMPTZ,

    -- Results
    result JSONB,
    error TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

-- Indexes for efficient job claiming
CREATE INDEX IF NOT EXISTS idx_jobs_claimable ON jobs (created_at)
    WHERE status = 'pending'
       OR (status = 'failed' AND retry_after IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);


-- RPC: Claim next available job
CREATE OR REPLACE FUNCTION claim_job(worker_id TEXT)
RETURNS TABLE (
    id UUID,
    status TEXT,
    job_type TEXT,
    payload JSONB,
    attempts INT,
    max_attempts INT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    UPDATE jobs j
    SET
        status = 'running',
        claimed_by = worker_id,
        claimed_at = NOW(),
        attempts = j.attempts + 1,
        retry_after = NULL
    WHERE j.id = (
        SELECT j2.id
        FROM jobs j2
        WHERE j2.status = 'pending'
           OR (j2.status = 'failed'
               AND j2.retry_after IS NOT NULL
               AND j2.retry_after < NOW()
               AND j2.attempts < j2.max_attempts)
        ORDER BY j2.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING
        j.id,
        j.status,
        j.job_type,
        j.payload,
        j.attempts,
        j.max_attempts,
        j.created_at;
END;
$$ LANGUAGE plpgsql;


-- RPC: Complete a job (success or failure)
CREATE OR REPLACE FUNCTION complete_job(
    job_id UUID,
    worker_id TEXT,
    new_status TEXT,
    job_result JSONB DEFAULT NULL,
    job_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    rows_affected INT;
    current_attempts INT;
    current_max_attempts INT;
BEGIN
    -- Get current attempts for retry logic
    SELECT attempts, max_attempts INTO current_attempts, current_max_attempts
    FROM jobs WHERE id = job_id;

    UPDATE jobs SET
        status = new_status,
        result = job_result,
        error = job_error,
        retry_after = CASE
            WHEN new_status = 'failed' AND current_attempts < current_max_attempts
            THEN NOW() + INTERVAL '10 seconds'
            ELSE NULL
        END,
        claimed_by = NULL,
        claimed_at = NULL,
        finished_at = NOW()
    WHERE id = job_id
      AND claimed_by = worker_id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;
