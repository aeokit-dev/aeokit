ALTER TABLE projects ADD COLUMN archived_at timestamptz;

CREATE INDEX projects_archived_at_idx ON projects (archived_at);
