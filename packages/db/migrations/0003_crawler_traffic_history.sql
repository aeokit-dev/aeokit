create table if not exists crawler_traffic_daily (
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  total_requests integer not null check (total_requests >= 0),
  identified_crawler_requests integer not null check (
    identified_crawler_requests >= 0
    and identified_crawler_requests <= total_requests
  ),
  families jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crawler_traffic_daily_project_date_pk primary key (project_id, date)
);

create index if not exists crawler_traffic_daily_project_end_idx
  on crawler_traffic_daily(project_id, end_at desc);
