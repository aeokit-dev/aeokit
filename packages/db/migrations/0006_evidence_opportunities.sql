alter table prompt_runs add column if not exists recommendation_rank integer;
alter table prompt_runs add column if not exists recommendation_strength text;
alter table prompt_runs add column if not exists sentiment text;

alter table citations add column if not exists raw_url text;
alter table citations add column if not exists final_url text;
alter table citations add column if not exists canonical_url text;

update citations
set
  raw_url = coalesce(raw_url, url),
  final_url = coalesce(final_url, url),
  canonical_url = coalesce(canonical_url, url)
where raw_url is null or final_url is null or canonical_url is null;

alter table citations alter column raw_url set not null;
alter table citations alter column final_url set not null;
alter table citations alter column canonical_url set not null;

create index if not exists citations_canonical_url_idx
  on citations(canonical_url);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  run_id uuid not null references prompt_runs(id) on delete cascade,
  text text not null,
  confidence integer not null check (confidence between 0 and 100),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'supported', 'contradicted')),
  created_at timestamptz not null default now()
);

create index if not exists claims_project_created_idx
  on claims(project_id, created_at desc);

create index if not exists claims_run_idx on claims(run_id);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null check (type in (
    'citation_gap',
    'content_authority',
    'winning_message',
    'competitor_advantage',
    'unsupported_claim',
    'reliability_warning'
  )),
  fingerprint text not null,
  priority integer not null check (priority between 0 and 100),
  confidence integer not null check (confidence between 0 and 100),
  early_signal boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  title text not null,
  explanation text not null,
  recommended_action text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  affected_prompt_ids jsonb not null default '[]'::jsonb,
  affected_urls jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (project_id, fingerprint)
);

create index if not exists opportunities_project_status_priority_idx
  on opportunities(project_id, status, priority desc);
