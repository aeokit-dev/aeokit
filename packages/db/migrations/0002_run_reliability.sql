alter table prompt_runs
  add column if not exists prompt_target_id uuid references prompt_targets(id) on delete set null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz;

update prompt_runs
set attempt_count = 1,
    last_attempt_at = coalesce(completed_at, created_at)
where attempt_count = 0
  and status in ('succeeded', 'failed');

update prompt_runs as run
set prompt_target_id = target.id
from prompt_targets as target
where run.prompt_target_id is null
  and target.prompt_id = run.prompt_id
  and target.provider = run.provider
  and target.model = run.model;

create index if not exists prompt_runs_target_idx
  on prompt_runs(prompt_target_id);

create table if not exists worker_heartbeats (
  id text primary key,
  status text not null default 'ready',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
