ALTER TABLE projects ADD COLUMN category text;
ALTER TABLE projects ADD COLUMN report_slug text;
ALTER TABLE projects ADD COLUMN report_published_at timestamptz;
ALTER TABLE projects ADD COLUMN report_sections jsonb NOT NULL DEFAULT '{"prompts":false,"answers":false,"competitors":true,"citations":true,"costs":false}'::jsonb;
CREATE UNIQUE INDEX projects_report_slug_idx ON projects (report_slug) WHERE report_slug IS NOT NULL;
CREATE TABLE report_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_audit_events_project_idx ON report_audit_events(project_id, created_at DESC);
