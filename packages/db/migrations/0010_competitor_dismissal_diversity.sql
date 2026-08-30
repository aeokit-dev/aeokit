ALTER TABLE "competitor_suggestion_dismissals"
ADD COLUMN "evidence_prompt_ids" text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE "competitor_suggestion_dismissals"
ADD COLUMN "evidence_providers" text[] NOT NULL DEFAULT ARRAY[]::text[];
