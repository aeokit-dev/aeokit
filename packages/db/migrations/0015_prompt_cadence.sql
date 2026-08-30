UPDATE prompts
SET cadence_minutes = 1440
WHERE cadence_minutes NOT IN (1440, 10080);

ALTER TABLE prompts
  ALTER COLUMN cadence_minutes SET DEFAULT 1440;

ALTER TABLE prompts
  DROP CONSTRAINT prompts_cadence_minutes_check;

ALTER TABLE prompts
  ADD CONSTRAINT prompts_cadence_minutes_check
  CHECK (cadence_minutes IN (1440, 10080));
