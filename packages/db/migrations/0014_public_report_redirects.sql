ALTER TABLE projects ADD COLUMN report_stale_after_days integer NOT NULL DEFAULT 30 CHECK (report_stale_after_days BETWEEN 1 AND 365);
CREATE TABLE report_redirects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, category_slug text NOT NULL, report_slug text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
