ALTER TABLE prompt_runs ADD COLUMN batch_id uuid;
ALTER TABLE prompt_runs ADD COLUMN trigger text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'scheduled'));
CREATE INDEX prompt_runs_batch_idx ON prompt_runs (batch_id);
