CREATE TABLE experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  name text NOT NULL,
  hypothesis text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  changed_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_ref text,
  baseline_run_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  followup_run_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  baseline_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation_due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experiments_status_check CHECK (
    status IN ('planned', 'running', 'evaluating', 'won', 'lost', 'inconclusive', 'cancelled')
  )
);

CREATE INDEX experiments_project_created_idx ON experiments(project_id, created_at);
CREATE INDEX experiments_opportunity_idx ON experiments(opportunity_id);
CREATE INDEX experiments_project_status_idx ON experiments(project_id, status);
