create extension if not exists pgcrypto;

do $$ begin
  create type run_status as enum ('pending', 'running', 'succeeded', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type citation_category as enum ('owned', 'competitor', 'social', 'institutional', 'other');
exception when duplicate_object then null;
end $$;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text not null,
  aliases text[] not null default '{}',
  additional_domains text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  website text,
  aliases text[] not null default '{}',
  domains text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists competitors_project_idx on competitors(project_id);
create unique index if not exists competitors_project_name_idx on competitors(project_id, name);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  value text not null,
  tags text[] not null default '{}',
  enabled boolean not null default true,
  cadence_minutes integer not null default 360 check (cadence_minutes >= 15),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prompts_project_idx on prompts(project_id);

create table if not exists prompt_targets (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  provider text not null,
  model text not null,
  web_search boolean not null default true
);
create index if not exists prompt_targets_prompt_idx on prompt_targets(prompt_id);
create unique index if not exists prompt_targets_unique_idx on prompt_targets(prompt_id, provider, model);

create table if not exists prompt_runs (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  provider text not null,
  model text not null,
  status run_status not null default 'pending',
  answer text,
  raw_output jsonb,
  brand_mentioned boolean not null default false,
  competitors_mentioned text[] not null default '{}',
  web_queries text[] not null default '{}',
  error text,
  latency_ms integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists prompt_runs_prompt_created_idx on prompt_runs(prompt_id, created_at desc);
create index if not exists prompt_runs_status_idx on prompt_runs(status);

create table if not exists citations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references prompt_runs(id) on delete cascade,
  url text not null,
  domain text not null,
  title text,
  position integer not null,
  category citation_category not null default 'other',
  competitor_name text,
  created_at timestamptz not null default now()
);
create index if not exists citations_run_idx on citations(run_id);
create index if not exists citations_domain_idx on citations(domain);
