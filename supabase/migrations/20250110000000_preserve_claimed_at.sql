-- Migration: Preserve claimed_at on job completion
-- Previously complete_job cleared claimed_at, but we need it to determine
-- cutoff timestamps for subsequent LINK_LIBRARY jobs.

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
        -- Keep claimed_at for reference by subsequent jobs
        finished_at = NOW()
    WHERE id = job_id
      AND claimed_by = worker_id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;
