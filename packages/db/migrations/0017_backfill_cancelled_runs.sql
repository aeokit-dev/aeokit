UPDATE prompt_runs
SET status = 'cancelled', error = 'Cancelled before provider request'
WHERE status = 'failed'
  AND attempt_count = 0
  AND provider_job_id IS NULL
  AND error = 'Workflow context changed before provider request';
