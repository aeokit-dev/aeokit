export type ReportSections = {
  prompts: boolean;
  answers: boolean;
  competitors: boolean;
  citations: boolean;
  costs: boolean;
};
type Project = {
  name: string;
  website: string;
  category: string | null;
  reportSlug: string | null;
  reportPublishedAt: Date | null;
  reportSections: ReportSections;
  updatedAt?: Date | string;
  reportStaleAfterDays?: number;
};
type Run = {
  provider: string;
  model: string;
  brandMentioned: boolean;
  answer: string | null;
  costUsd: number | null;
  completedAt: Date | null;
  prompt?: string;
  competitorsMentioned?: string[];
  status?: "pending" | "running" | "succeeded" | "failed" | "cancelled";
};
type Citation = { url: string; domain: string; title: string | null };
export type PublicReport = ReturnType<typeof buildPublicReport>;

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "brand";
export const publicReportPath = (
  project: Pick<Project, "name" | "category" | "reportSlug">,
) =>
  `/reports/${slugify(project.category || "uncategorized")}/${project.reportSlug || `${slugify(project.name)}-ai-visibility`}`;

export function shouldIndexPublicReport(
  project: Pick<Project, "reportPublishedAt">,
  sampleSize: number,
  now = new Date(),
) {
  return Boolean(
    project.reportPublishedAt &&
    sampleSize >= 10 &&
    now.getTime() - project.reportPublishedAt.getTime() <= 90 * 864e5,
  );
}

export function buildPublicReport(
  project: Project,
  runs: Run[],
  citations: Citation[],
  now = new Date(),
) {
  const completed = runs.filter(
    (r) => r.completedAt && (r.status ?? "succeeded") === "succeeded",
  );
  const lastMeasured =
    completed
      .map((r) => r.completedAt!)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const firstMeasured =
    completed
      .map((r) => r.completedAt!)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const indexable =
    shouldIndexPublicReport(project, completed.length, now) &&
    Boolean(
      lastMeasured &&
      now.getTime() - lastMeasured.getTime() <=
        (project.reportStaleAfterDays ?? 30) * 864e5,
    );
  const mentioned = completed.filter((r) => r.brandMentioned).length;
  const percentage = (value: number, total: number) =>
    total ? Math.round((value / total) * 1000) / 10 : 0;
  const grouped = <T>(items: T[], key: (item: T) => string) => {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const name = key(item);
      groups.set(name, [...(groups.get(name) ?? []), item]);
    }
    return groups;
  };
  const trend = [
    ...grouped(completed, (r) => r.completedAt!.toISOString().slice(0, 10)),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      date,
      sampleSize: rows.length,
      mentionRate: percentage(
        rows.filter((r) => r.brandMentioned).length,
        rows.length,
      ),
    }));
  const competitorCounts = new Map<string, number>();
  completed
    .flatMap((r) => r.competitorsMentioned ?? [])
    .forEach((name) =>
      competitorCounts.set(name, (competitorCounts.get(name) ?? 0) + 1),
    );
  const voiceTotal =
    mentioned + [...competitorCounts.values()].reduce((a, b) => a + b, 0);
  const shareOfVoice = [
    { name: project.name, mentions: mentioned },
    ...[...competitorCounts].map(([name, mentions]) => ({ name, mentions })),
  ]
    .map((row) => ({
      ...row,
      percentage: percentage(row.mentions, voiceTotal),
    }))
    .sort((a, b) => b.mentions - a.mentions);
  const providerCoverage = [
    ...grouped(completed, (r) => `${r.provider}\0${r.model}`),
  ].map(([key, rows]) => {
    const [provider, model] = key.split("\0");
    return {
      provider: provider!,
      model: model!,
      sampleSize: rows.length,
      mentionRate: percentage(
        rows.filter((r) => r.brandMentioned).length,
        rows.length,
      ),
    };
  });
  const promptPerformance = project.reportSections.prompts
    ? [
        ...grouped(
          completed.filter((r) => r.prompt),
          (r) => r.prompt!,
        ),
      ]
        .map(([prompt, rows]) => ({
          prompt,
          sampleSize: rows.length,
          mentionRate: percentage(
            rows.filter((r) => r.brandMentioned).length,
            rows.length,
          ),
        }))
        .slice(0, 100)
    : [];
  const citationGroups = new Map<
    string,
    { domain: string; count: number; urls: Set<string> }
  >();
  for (const citation of citations) {
    const group = citationGroups.get(citation.domain) ?? {
      domain: citation.domain,
      count: 0,
      urls: new Set<string>(),
    };
    group.count += 1;
    group.urls.add(citation.url);
    citationGroups.set(citation.domain, group);
  }
  const commonCitations = project.reportSections.citations
    ? [...citationGroups.values()]
        .map((group) => ({
          domain: group.domain,
          count: group.count,
          urls: [...group.urls].slice(0, 10),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 100)
    : [];
  const attempted = runs.filter(
    (run) =>
      (run.status ?? "succeeded") === "succeeded" || run.status === "failed",
  );
  return {
    project,
    path: publicReportPath(project),
    sampleSize: completed.length,
    attemptedRuns: attempted.length,
    failedRuns: runs.filter((r) => r.status === "failed").length,
    usableCoverage: percentage(completed.length, attempted.length),
    confidence:
      completed.length >= 100
        ? "high"
        : completed.length >= 30
          ? "medium"
          : completed.length
            ? "low"
            : "none",
    mentionRate: completed.length
      ? Math.round((mentioned / completed.length) * 1000) / 10
      : 0,
    providers: [...new Set(completed.map((r) => r.provider))],
    models: [...new Set(completed.map((r) => r.model))],
    trend,
    shareOfVoice: project.reportSections.competitors ? shareOfVoice : [],
    providerCoverage,
    promptPerformance,
    commonCitations,
    lastMeasured,
    firstMeasured,
    updatedAt: project.updatedAt ? new Date(project.updatedAt) : now,
    stale:
      !lastMeasured ||
      now.getTime() - lastMeasured.getTime() >
        (project.reportStaleAfterDays ?? 30) * 864e5,
    indexable,
    prompts: project.reportSections.prompts
      ? completed.map((r) => r.prompt).filter(Boolean)
      : [],
    answers: project.reportSections.answers
      ? completed.map((r) => r.answer).filter(Boolean)
      : [],
    competitors: project.reportSections.competitors
      ? [...new Set(completed.flatMap((r) => r.competitorsMentioned ?? []))]
      : [],
    citations: project.reportSections.citations ? citations.slice(0, 100) : [],
    totalCost: project.reportSections.costs
      ? completed.reduce((n, r) => n + (r.costUsd ?? 0), 0)
      : null,
  };
}
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function renderBasePublicReportHtml(
  report: PublicReport,
  origin: string,
  preview = false,
) {
  if (preview) report = { ...report, indexable: false };
  const canonical = `${origin.replace(/\/$/, "")}${report.path}`;
  const title = `${report.project.name} AI visibility report | AeoKit`;
  const description = `Measured AI visibility for ${report.project.name}: ${report.mentionRate}% mention rate across ${report.sampleSize} answers.`;
  const list = (items: unknown[]) =>
    items.length
      ? `<ul>${items.map((x) => `<li>${esc(typeof x === "object" ? JSON.stringify(x) : x)}</li>`).join("")}</ul>`
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${report.indexable ? "index, follow" : "noindex, nofollow"}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Report", name: title, url: canonical, dateModified: report.updatedAt.toISOString() }).replace(/</g, "\\u003c")}</script><style>body{font:16px system-ui;max-width:900px;margin:auto;padding:3rem 1rem;color:#18202a}header,section{margin-bottom:2.5rem}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}dt{color:#667}dd{font-size:1.5rem;margin:0}small{color:#667}.warning{background:#fff3cd;padding:1rem}</style></head><body><header><small>${esc(report.project.category || "Uncategorized")} · Independent measurement</small><h1>${esc(report.project.name)} AI visibility report</h1><p>${esc(description)}</p>${report.stale ? '<p class="warning">This report contains stale data and is not eligible for indexing.</p>' : ""}</header><main><section><h2>Measured results</h2><dl><div><dt>AI mention rate</dt><dd>${report.mentionRate}%</dd></div><div><dt>Sample size</dt><dd>${report.sampleSize}</dd></div><div><dt>Provider coverage</dt><dd>${report.providers.length}</dd></div></dl><p>Measurement window ends <time>${esc(report.lastMeasured?.toISOString() || "No measurements")}</time>. Last updated <time>${report.updatedAt.toISOString()}</time>.</p></section>${report.competitors.length ? `<section><h2>Competitor comparison</h2>${list(report.competitors)}</section>` : ""}${report.prompts.length ? `<section><h2>Prompt performance</h2>${list(report.prompts)}</section>` : ""}${report.answers.length ? `<section><h2>Representative answer evidence</h2>${list(report.answers)}</section>` : ""}${report.citations.length ? `<section><h2>Commonly cited sources</h2>${list(report.citations.map((c) => c.domain))}</section>` : ""}${report.totalCost === null ? "" : `<p>Measured provider cost: $${report.totalCost.toFixed(2)}</p>`}<section><h2>AeoKit methodology</h2><p>Mention rate is the share of successful sampled answers that mention the tracked brand. Provider failures are excluded and coverage and sample size are shown so results are not presented as universal.</p></section></main><footer><p>Measured with <a href="https://aeokit.dev/">AeoKit</a>. Track and improve your brand’s AI visibility.</p></footer></body></html>`;
}

export function renderPublicReportHtml(
  report: PublicReport,
  origin: string,
  preview = false,
) {
  const table = (headers: string[], rows: unknown[][]) =>
    rows.length
      ? `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : "<p>No measured evidence is available for this section.</p>";
  const trend = `<section><h2>Historical visibility trend</h2>${table(
    ["Date", "Answers", "Mention rate"],
    report.trend.map((row) => [
      row.date,
      row.sampleSize,
      `${row.mentionRate}%`,
    ]),
  )}</section>`;
  const providers = `<section><h2>Provider and model coverage</h2>${table(
    ["Provider", "Model", "Answers", "Mention rate"],
    report.providerCoverage.map((row) => [
      row.provider,
      row.model,
      row.sampleSize,
      `${row.mentionRate}%`,
    ]),
  )}</section>`;
  const voice = report.project.reportSections.competitors
    ? `<section><h2>Share of voice and competitor comparison</h2>${table(
        ["Brand", "Mentions", "Share of voice"],
        report.shareOfVoice.map((row) => [
          row.name,
          row.mentions,
          `${row.percentage}%`,
        ]),
      )}</section>`
    : "";
  const prompts = report.project.reportSections.prompts
    ? `<section><h2>Prompt-level performance</h2>${table(
        ["Prompt", "Answers", "Mention rate"],
        report.promptPerformance.map((row) => [
          row.prompt,
          row.sampleSize,
          `${row.mentionRate}%`,
        ]),
      )}</section>`
    : "";
  const citations = report.project.reportSections.citations
    ? `<section><h2>Citations and commonly cited domains</h2>${table(
        ["Domain", "Citations", "Pages"],
        report.commonCitations.map((row) => [
          row.domain,
          row.count,
          row.urls.join(", "),
        ]),
      )}</section>`
    : "";
  const previewNotice = preview
    ? '<p class="warning">Private preview — this page is not indexable.</p>'
    : "";
  const trust = `<section><h2>Coverage and confidence</h2><dl><div><dt>Attempted answers</dt><dd>${report.attemptedRuns}</dd></div><div><dt>Usable coverage</dt><dd>${report.usableCoverage}%</dd></div><div><dt>Confidence</dt><dd>${esc(report.confidence)}</dd></div></dl><p>${report.failedRuns} failed answer${report.failedRuns === 1 ? "" : "s"} did not contribute to visibility scoring.</p></section>`;
  const identity = `<p>Brand domain: <a href="${esc(report.project.website)}" rel="nofollow">${esc(report.project.website)}</a></p><p>Measurement window: <time>${esc(report.firstMeasured?.toISOString() ?? "No measurements")}</time> to <time>${esc(report.lastMeasured?.toISOString() ?? "No measurements")}</time>.</p>`;
  return renderBasePublicReportHtml(report, origin, preview)
    .replace(
      "</head>",
      `<meta property="og:image" content="${esc(origin.replace(/\/$/, ""))}/og.png"><meta name="twitter:card" content="summary_large_image"></head>`,
    )
    .replace("</header>", `${identity}</header>`)
    .replace(
      "<dt>AI mention rate</dt>",
      `<dt>Overall AI visibility</dt><dd>${report.mentionRate}%</dd></div><div><dt>AI mention rate</dt>`,
    )
    .replace(
      "AeoKit methodology</h2>",
      `<a href="${esc(origin.replace(/\/$/, ""))}/methodology/v1">AeoKit methodology</a></h2>`,
    )
    .replace("<main>", `<main>${previewNotice}${trust}`)
    .replace(
      "</main>",
      `${trend}${providers}${voice}${prompts}${citations}</main>`,
    );
}
