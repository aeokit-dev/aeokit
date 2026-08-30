alter table prompt_runs
  add column if not exists provider_job_id text,
  add column if not exists dedupe_key text;

create unique index if not exists prompt_runs_dedupe_idx
  on prompt_runs(dedupe_key);
