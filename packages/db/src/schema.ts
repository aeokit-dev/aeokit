import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const runStatus = pgEnum("run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const citationCategory = pgEnum("citation_category", [
  "owned",
  "competitor",
  "social",
  "institutional",
  "other",
]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website").notNull(),
  aliases: text("aliases").array().notNull().default([]),
  additionalDomains: text("additional_domains").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  category: text("category"),
  reportSlug: text("report_slug").unique(),
  reportPublishedAt: timestamp("report_published_at", { withTimezone: true }),
  reportStaleAfterDays: integer("report_stale_after_days")
    .notNull()
    .default(30),
  reportSections: jsonb("report_sections")
    .$type<{
      prompts: boolean;
      answers: boolean;
      competitors: boolean;
      citations: boolean;
      costs: boolean;
    }>()
    .notNull()
    .default({
      prompts: false,
      answers: false,
      competitors: true,
      citations: true,
      costs: false,
    }),
});

export const reportAuditEvents = pgTable("report_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reportRedirects = pgTable("report_redirects", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  categorySlug: text("category_slug").notNull(),
  reportSlug: text("report_slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website"),
    aliases: text("aliases").array().notNull().default([]),
    domains: text("domains").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("competitors_project_idx").on(table.projectId),
    uniqueIndex("competitors_project_name_idx").on(table.projectId, table.name),
  ],
);

export const competitorSuggestionDismissals = pgTable(
  "competitor_suggestion_dismissals",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    normalizedName: text("normalized_name").notNull(),
    mentionCount: integer("mention_count").notNull(),
    promptCount: integer("prompt_count").notNull(),
    providerCount: integer("provider_count").notNull(),
    evidenceRunIds: text("evidence_run_ids").array().notNull().default([]),
    evidencePromptIds: text("evidence_prompt_ids")
      .array()
      .notNull()
      .default([]),
    evidenceProviders: text("evidence_providers").array().notNull().default([]),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.normalizedName],
      name: "competitor_suggestion_dismissals_pk",
    }),
  ],
);

export const aiChatSessions = pgTable(
  "ai_chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_chat_sessions_project_updated_idx").on(
      table.projectId,
      table.updatedAt,
    ),
  ],
);

export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aiChatSessions.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations")
      .$type<
        Array<{
          url: string;
          domain: string;
          title?: string;
          position: number;
        }>
      >()
      .notNull()
      .default([]),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_chat_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    tags: text("tags").array().notNull().default([]),
    generationMetadata: jsonb("generation_metadata").$type<Record<
      string,
      unknown
    > | null>(),
    enabled: boolean("enabled").notNull().default(true),
    cadenceMinutes: integer("cadence_minutes").notNull().default(1_440),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("prompts_project_idx").on(table.projectId),
    uniqueIndex("prompts_project_normalized_value_idx").on(
      table.projectId,
      table.normalizedValue,
    ),
  ],
);

export const promptTargets = pgTable(
  "prompt_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    webSearch: boolean("web_search").notNull().default(true),
  },
  (table) => [
    index("prompt_targets_prompt_idx").on(table.promptId),
    uniqueIndex("prompt_targets_unique_idx").on(
      table.promptId,
      table.provider,
      table.model,
    ),
  ],
);

export const promptRuns = pgTable(
  "prompt_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    promptTargetId: uuid("prompt_target_id").references(
      () => promptTargets.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: runStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    providerJobId: text("provider_job_id"),
    dedupeKey: text("dedupe_key"),
    batchId: uuid("batch_id"),
    trigger: text("trigger")
      .$type<"manual" | "scheduled">()
      .notNull()
      .default("manual"),
    answer: text("answer"),
    rawOutput: jsonb("raw_output"),
    brandMentioned: boolean("brand_mentioned").notNull().default(false),
    recommendationRank: integer("recommendation_rank"),
    recommendationStrength: text("recommendation_strength").$type<
      "best_overall" | "top_choice" | "alternative" | "neutral_mention" | null
    >(),
    sentiment: text("sentiment").$type<
      "positive" | "neutral" | "negative" | null
    >(),
    competitorsMentioned: text("competitors_mentioned")
      .array()
      .notNull()
      .default([]),
    webQueries: text("web_queries").array().notNull().default([]),
    error: text("error"),
    latencyMs: integer("latency_ms"),
    costUsd: numeric("cost_usd", {
      precision: 14,
      scale: 8,
      mode: "number",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("prompt_runs_prompt_created_idx").on(table.promptId, table.createdAt),
    index("prompt_runs_target_idx").on(table.promptTargetId),
    index("prompt_runs_status_idx").on(table.status),
    index("prompt_runs_batch_idx").on(table.batchId),
    uniqueIndex("prompt_runs_dedupe_idx").on(table.dedupeKey),
  ],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("ready"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => promptRuns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    rawUrl: text("raw_url").notNull(),
    finalUrl: text("final_url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    position: integer("position").notNull(),
    category: citationCategory("category").notNull().default("other"),
    competitorName: text("competitor_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("citations_run_idx").on(table.runId),
    index("citations_domain_idx").on(table.domain),
    index("citations_canonical_url_idx").on(table.canonicalUrl),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => promptRuns.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    confidence: integer("confidence").notNull(),
    verificationStatus: text("verification_status")
      .$type<"unverified" | "supported" | "contradicted">()
      .notNull()
      .default("unverified"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("claims_project_created_idx").on(table.projectId, table.createdAt),
    index("claims_run_idx").on(table.runId),
  ],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type")
      .$type<
        | "citation_gap"
        | "content_authority"
        | "winning_message"
        | "competitor_advantage"
        | "unsupported_claim"
        | "reliability_warning"
      >()
      .notNull(),
    fingerprint: text("fingerprint").notNull(),
    priority: integer("priority").notNull(),
    confidence: integer("confidence").notNull(),
    earlySignal: boolean("early_signal").notNull().default(false),
    status: text("status")
      .$type<"open" | "in_progress" | "resolved" | "dismissed">()
      .notNull()
      .default("open"),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    affectedPromptIds: jsonb("affected_prompt_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    affectedUrls: jsonb("affected_urls")
      .$type<string[]>()
      .notNull()
      .default([]),
    completedActionIndices: jsonb("completed_action_indices")
      .$type<number[]>()
      .notNull()
      .default([]),
    dueAt: timestamp("due_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("opportunities_project_fingerprint_idx").on(
      table.projectId,
      table.fingerprint,
    ),
    index("opportunities_project_status_priority_idx").on(
      table.projectId,
      table.status,
      table.priority,
    ),
  ],
);

export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    hypothesis: text("hypothesis").notNull(),
    status: text("status")
      .$type<
        | "planned"
        | "running"
        | "evaluating"
        | "won"
        | "lost"
        | "inconclusive"
        | "cancelled"
      >()
      .notNull()
      .default("planned"),
    changedUrls: jsonb("changed_urls").$type<string[]>().notNull().default([]),
    changeRef: text("change_ref"),
    baselineRunIds: jsonb("baseline_run_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    followupRunIds: jsonb("followup_run_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    baselineMetrics: jsonb("baseline_metrics")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    resultMetrics: jsonb("result_metrics")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    evaluationDueAt: timestamp("evaluation_due_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("experiments_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    index("experiments_opportunity_idx").on(table.opportunityId),
    index("experiments_project_status_idx").on(table.projectId, table.status),
  ],
);

export const crawlerTrafficDaily = pgTable(
  "crawler_traffic_daily",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    totalRequests: integer("total_requests").notNull(),
    identifiedCrawlerRequests: integer("identified_crawler_requests").notNull(),
    families: jsonb("families")
      .$type<Array<{ family: string; requests: number }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.date],
      name: "crawler_traffic_daily_project_date_pk",
    }),
    index("crawler_traffic_daily_project_end_idx").on(
      table.projectId,
      table.endAt,
    ),
  ],
);

export type Project = typeof projects.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type CompetitorSuggestionDismissal =
  typeof competitorSuggestionDismissals.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type PromptTarget = typeof promptTargets.$inferSelect;
export type PromptRun = typeof promptRuns.$inferSelect;
export type Citation = typeof citations.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type WorkerHeartbeat = typeof workerHeartbeats.$inferSelect;
export type CrawlerTrafficDaily = typeof crawlerTrafficDaily.$inferSelect;
