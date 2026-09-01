export interface Project {
  id: string;
  name: string;
  website: string;
  aliases: string[];
  additionalDomains: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  category?: string | null;
  reportSlug?: string | null;
  reportPublishedAt?: string | null;
  reportStaleAfterDays?: number;
  reportSections?: {
    prompts: boolean;
    answers: boolean;
    competitors: boolean;
    citations: boolean;
    costs: boolean;
  };
}

export interface Competitor {
  id: string;
  projectId: string;
  name: string;
  website: string | null;
  aliases: string[];
  domains: string[];
  createdAt: string;
}

export interface CompetitorSuggestion {
  key: string;
  name: string;
  aliases: string[];
  mentionCount: number;
  mentionPercentage: number;
  promptCount: number;
  providerCount: number;
  confidenceScore: number;
  confidence: "low" | "medium" | "high";
  evidence: Array<{
    runId: string;
    promptId: string;
    prompt: string;
    provider: string;
    model: string;
    excerpt: string;
    completedAt: string;
  }>;
}

export interface CompetitorDiscoveryResponse {
  range: "30d" | "90d" | "365d" | "all";
  answersAnalyzed: number;
  providerQueryCostUsd: 0;
  expectedAdditionalRuns: number;
  suggestions: CompetitorSuggestion[];
}

export interface AiChatSession {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatCitation {
  url: string;
  domain: string;
  title?: string;
  position: number;
}

export interface AiChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  citations: AiChatCitation[];
  model: string | null;
  createdAt: string;
}

export interface AiChatSendResponse {
  session: AiChatSession;
  userMessage: AiChatMessage;
  assistantMessage: AiChatMessage;
  uiActions: AiChatUiAction[];
}

export interface AiChatBackend {
  id: "local" | "openrouter";
  label: string;
  model: string;
}

export type AiChatUiAction =
  | { type: "show_ui_insight"; insightId: string; label: string }
  | {
      type: "open_app_page";
      page:
        | "dashboard"
        | "opportunities"
        | "visibility"
        | "prompts"
        | "share-of-voice"
        | "citations"
        | "ai-referrals"
        | "crawler-traffic"
        | "runs"
        | "competitors";
      label: string;
      executeImmediately: boolean;
    };

export interface ProviderStatus {
  id: "brightdata" | "openai" | "anthropic" | "openrouter" | "dataforseo";
  label: string;
  configured: boolean;
  defaultModel: string;
  modelOptions: Array<{
    id: string;
    label: string;
    maxPromptCharacters?: number;
  }>;
  status: "missing_credentials" | "worker_offline" | "failing" | "ready";
  lastSuccessfulRunAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export interface ProviderHealthResponse {
  providers: ProviderStatus[];
  worker: {
    status: "ready" | "offline";
    lastSeenAt: string | null;
    startedAt: string | null;
  };
}

export interface IntegrationStatus {
  configured: boolean;
  authentication: "oauth" | "token" | null;
  connectedAt: string | null;
  updatedAt: string | null;
  error: string | null;
}

export interface ProjectIntegrationsResponse {
  canManage: boolean;
  secureStorageAvailable: boolean;
  oauth: {
    posthog: boolean;
    cloudflare: boolean;
  };
  posthog: IntegrationStatus & {
    host: string | null;
    postHogProjectId: string | null;
    successEvents: string[];
  };
  cloudflare: IntegrationStatus;
}

export interface RuntimeConfig {
  showProviderCosts: boolean;
  authMode?: "clerk" | "unavailable";
  clerkPublishableKey?: string | null;
}

export interface MeResponse {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    imageUrl: string;
  };
  activeOrganization: OrganizationSummary;
  organizations: OrganizationSummary[];
  role: "owner" | "admin" | "member";
  capabilities: {
    manageBusinessData: boolean;
    manageOrganization: boolean;
    inviteMembers: boolean;
    changeMemberRoles: boolean;
    removeMembers: boolean;
    productSuperadmin: boolean;
    viewProviderCosts: boolean;
  };
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
}

export interface PromptTarget {
  id: string;
  promptId: string;
  provider: ProviderStatus["id"];
  model: string;
  webSearch: boolean;
}

export interface Prompt {
  id: string;
  projectId: string;
  value: string;
  tags: string[];
  enabled: boolean;
  cadenceMinutes: number;
  createdAt: string;
  updatedAt: string;
  targets: PromptTarget[];
  lastRunAt: string | null;
  hasActiveRun: boolean;
}

export type PromptIntent =
  | "category_discovery"
  | "use_case"
  | "audience_industry"
  | "comparison"
  | "alternatives"
  | "evaluation"
  | "transactional";

export interface PromptSuggestion {
  value: string;
  intent: PromptIntent;
  branded: boolean;
}

export interface PromptSuggestionResponse {
  suggestions: PromptSuggestion[];
  derivedContext: {
    category: string;
    subcategories: string[];
    audiences: string[];
  };
  source: "openrouter" | "template";
  warning?: string;
  costUsd?: number | null;
  metadata: Record<string, unknown>;
}

export interface Run {
  id: string;
  promptId: string;
  promptValue?: string;
  provider: string;
  model: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  attemptCount: number;
  lastAttemptAt: string | null;
  answer: string | null;
  brandMentioned: boolean;
  recommendationRank: number | null;
  recommendationStrength:
    "best_overall" | "top_choice" | "alternative" | "neutral_mention" | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  competitorsMentioned: string[];
  webQueries: string[];
  error: string | null;
  latencyMs: number | null;
  costUsd?: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MonitorRun extends Run {
  projectId: string;
  projectName: string;
  promptValue: string;
  batchId: string | null;
  trigger: "manual" | "scheduled";
}

export interface RunMonitorResponse {
  counts: Record<Run["status"], number>;
  batches: Array<{
    batchId: string;
    total: number;
    completed: number;
    succeeded: number;
    failed: number;
    successRate: number;
    costUsd: number;
    elapsedMs: number;
    estimatedRemainingMs: number | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  runs: MonitorRun[];
}

export interface Citation {
  id: string;
  runId: string;
  url: string;
  rawUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  domain: string;
  title: string | null;
  position: number;
  category: "owned" | "competitor" | "social" | "institutional" | "other";
  competitorName: string | null;
  createdAt: string;
  provider: string;
  model: string;
  promptValue: string;
}

export type OpportunityType =
  | "citation_gap"
  | "content_authority"
  | "winning_message"
  | "competitor_advantage"
  | "unsupported_claim"
  | "reliability_warning";

export type OpportunityStatus =
  "open" | "in_progress" | "resolved" | "dismissed";

export interface Opportunity {
  id: string;
  projectId: string;
  type: OpportunityType;
  priority: number;
  confidence: number;
  earlySignal: boolean;
  status: OpportunityStatus;
  title: string;
  explanation: string;
  recommendedAction: string;
  evidenceIds: string[];
  affectedPromptIds: string[];
  affectedUrls: string[];
  completedActionIndices: number[];
  dueAt: string | null;
  evidenceSummaries: OpportunityEvidenceSummary[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface OpportunityEvidenceSummary {
  runId: string;
  provider: string;
  model: string;
  answerExcerpt: string;
  createdAt: string;
}

export type ExperimentStatus =
  | "planned"
  | "running"
  | "evaluating"
  | "won"
  | "lost"
  | "inconclusive"
  | "cancelled";

export interface Experiment {
  id: string;
  projectId: string;
  opportunityId: string | null;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  changedUrls: string[];
  changeRef: string | null;
  baselineRunIds: string[];
  followupRunIds: string[];
  baselineMetrics: Record<string, number>;
  resultMetrics: Record<string, number>;
  evaluationDueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunDetail extends Run {
  promptValue: string;
  citations: Citation[];
}

export interface DashboardData {
  visibility: number | null;
  mentionRate: number | null;
  citationRate: number | null;
  trackedPrompts: number;
  activePrompts: number;
  successfulRuns: number;
  dataTrust: {
    attemptedRuns: number;
    successfulRuns: number;
    failedRuns: number;
    pendingRuns: number;
    runningRuns: number;
    usableCoveragePercentage: number;
  };
  mentionConfidence: {
    level: "none" | "low" | "medium" | "high";
    sampleSize: number;
    interval: { low: number; high: number } | null;
  };
  providerCoverage: {
    coveredSurfaces: number;
    totalSurfaces: number;
    percentage: number | null;
  };
  citedRuns: number;
  totalCitations: number;
  ownedCitations: number;
  trend: Array<{
    date: string;
    visibility: number | null;
    runs: number;
    attemptedRuns: number;
    failedRuns: number;
    coverage: number;
  }>;
  shareOfVoice: Array<{ name: string; mentions: number; share: number }>;
  recentRuns: Run[];
  totalCostUsd?: number;
  costedRuns?: number;
  overallCostUsd?: number;
  overallCostedRuns?: number;
}

export interface ShareOfVoiceEngineRow {
  engine: string;
  provider: string;
  model: string;
  providerLabel: string;
  configured: boolean;
  successfulRuns: number;
  failedRuns: number;
  mentions: number;
  totalMentions: number;
  share: number;
}

export interface ShareOfVoiceReport {
  period: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
  };
  overview: {
    share: number;
    previousShare: number | null;
    change: number | null;
    mentions: number;
    totalMentions: number;
    rank: number;
    trackedBrands: number;
    leaderboard: Array<{ name: string; mentions: number; share: number }>;
  };
  trend: Array<{
    date: string;
    share: number;
    mentions: number;
    totalMentions: number;
  }>;
  engines: ShareOfVoiceEngineRow[];
  confidence: {
    successfulRuns: number;
    failedRuns: number;
    pendingRuns: number;
    completionRate: number;
    level: "none" | "low" | "medium" | "high";
  };
  categories: Array<{
    category: string;
    prompts: number;
    successfulRuns: number;
    mentions: number;
    totalMentions: number;
    share: number;
  }>;
  prompts: Array<{
    promptId: string;
    prompt: string;
    category: string;
    successfulRuns: number;
    mentions: number;
    totalMentions: number;
    share: number;
    leader: string;
    gap: number;
  }>;
  citationOwnership: {
    total: number;
    owned: number;
    competitor: number;
    thirdParty: number;
    ownedShare: number;
    ownedPages: Array<{
      url: string;
      domain: string;
      title: string | null;
      citations: number;
    }>;
    externalSources: Array<{
      domain: string;
      category: "competitor" | "social" | "institutional" | "other";
      competitorName: string | null;
      citations: number;
    }>;
  };
  competitorGaps: Array<{
    competitor: string;
    losses: number;
    category: string;
    engine: string;
    engineProvider: string;
    competitorCitations: number;
    thirdPartyCitations: number;
    reason: string;
  }>;
}

export interface AiReferralMetrics {
  sessions: number;
  pageviews: number;
  convertingSessions: number | null;
  conversions: number | null;
  conversionRate: number | null;
  averageSessionDurationSeconds: number | null;
  bounceRate: number | null;
}

export interface AiReferralLandingPage extends AiReferralMetrics {
  path: string;
  trackedCitationCount: number;
}

export interface AiReferralSource extends AiReferralMetrics {
  domain: string;
  label: string;
  landingPages: AiReferralLandingPage[];
}

export interface AiReferralsData {
  period: "7d" | "30d" | "90d";
  siteHost: string;
  successEvents: string[];
  totals: AiReferralMetrics;
  previousPeriod: AiReferralMetrics;
  sources: AiReferralSource[];
  citedLandingPageSessions: number;
  trackedCitationCount: number;
  queriedAt: string;
  cached: boolean;
}

export type AiReferralsResponse =
  | { configured: false; missing: string[] }
  | { configured: true; data: AiReferralsData };

export type CrawlerFamily =
  | "OpenAI"
  | "Anthropic"
  | "Perplexity"
  | "Google"
  | "Bing"
  | "Meta/Facebook"
  | "Apple"
  | "Amazon"
  | "Semrush"
  | "Ahrefs"
  | "MJ12"
  | "Other automated";

export interface CrawlerTrafficData {
  totalRequests: number;
  identifiedCrawlerRequests: number;
  crawlerSharePercentage: number;
  families: Array<{
    family: CrawlerFamily;
    requests: number;
  }>;
  topUserAgents: Array<{
    userAgent: string;
    family: CrawlerFamily;
    requests: number;
  }>;
  start: string;
  end: string;
}

export interface CrawlerTrafficHistoryDay {
  date: string;
  totalRequests: number;
  identifiedCrawlerRequests: number;
  crawlerSharePercentage: number;
  families: Array<{
    family: CrawlerFamily;
    requests: number;
  }>;
  start: string;
  end: string;
}

export interface CrawlerTrafficHistoryData {
  days: CrawlerTrafficHistoryDay[];
}

export interface CitationSurfaceCoverage {
  surface: string;
  provider: string;
  model: string;
  providerLabel: string;
  successfulRuns: number;
  citations: number;
  sourcesUnavailable: boolean;
}
