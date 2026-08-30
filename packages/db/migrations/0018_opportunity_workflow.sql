ALTER TABLE opportunities
  ADD COLUMN completed_action_indices jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE opportunities
  ADD COLUMN due_at timestamptz;
