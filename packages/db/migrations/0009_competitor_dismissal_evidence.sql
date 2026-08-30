ALTER TABLE "competitor_suggestion_dismissals"
ADD COLUMN "evidence_run_ids" text[] NOT NULL DEFAULT ARRAY[]::text[];
