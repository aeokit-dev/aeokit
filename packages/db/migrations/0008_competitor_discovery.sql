CREATE TABLE "competitor_suggestion_dismissals" (
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "normalized_name" text NOT NULL,
  "mention_count" integer NOT NULL,
  "prompt_count" integer NOT NULL,
  "provider_count" integer NOT NULL,
  "dismissed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "competitor_suggestion_dismissals_pk" PRIMARY KEY ("project_id", "normalized_name")
);
