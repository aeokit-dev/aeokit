import { closeDatabase, sql } from "./client";

const projectId = "11111111-1111-4111-8111-111111111111";
const promptIds = [
  "21111111-1111-4111-8111-111111111111",
  "21111111-1111-4111-8111-111111111112",
  "21111111-1111-4111-8111-111111111113",
];

await sql`
  insert into projects (id, name, website, aliases, additional_domains)
  values (${projectId}, 'aeokit', 'https://aeokit.dev', array['aeokit'], array[]::text[])
  on conflict (id) do nothing
`;

await sql`
  insert into competitors (project_id, name, website, aliases, domains)
  values
    (${projectId}, 'Acme Analytics', 'https://acme.test', array['Acme'], array['acme.test']),
    (${projectId}, 'Northstar', 'https://northstar.test', array[]::text[], array['northstar.test'])
  on conflict (project_id, name) do nothing
`;

const promptValues = [
  "What are the best open-source AI visibility tracking tools?",
  "Which tools help brands improve visibility in AI answers?",
  "Compare self-hosted AEO platforms for a small marketing team.",
];

for (const [index, id] of promptIds.entries()) {
  await sql`
    insert into prompts (id, project_id, value, normalized_value, tags, cadence_minutes)
    values (${id}, ${projectId}, ${promptValues[index]!}, lower(${promptValues[index]!}), array['discovery'], 1440)
    on conflict (id) do nothing
  `;
  await sql`
    insert into prompt_targets (prompt_id, provider, model, web_search)
    values
      (${id}, 'openai', 'gpt-5-mini', true),
      (${id}, 'anthropic', 'claude-sonnet-5', true)
    on conflict (prompt_id, provider, model) do nothing
  `;
}

const countRows = await sql<{ count: number }[]>`
  select count(*)::int as count
  from prompt_runs
  where prompt_id = any(${promptIds})
`;
const count = countRows[0]?.count ?? 0;

if (count === 0) {
  for (let day = 13; day >= 0; day -= 1) {
    for (const [promptIndex, promptId] of promptIds.entries()) {
      for (const provider of ["openai", "anthropic"] as const) {
        const brandMentioned =
          (day + promptIndex + (provider === "openai" ? 1 : 0)) % 4 !== 0;
        const competitorsMentioned =
          (day + promptIndex) % 3 === 0
            ? ["Acme Analytics"]
            : (day + promptIndex) % 5 === 0
              ? ["Northstar"]
              : [];
        const createdAt = new Date(Date.now() - day * 24 * 60 * 60 * 1_000);
        const [run] = await sql<{ id: string }[]>`
          insert into prompt_runs (
            prompt_id, provider, model, status, answer, brand_mentioned,
            competitors_mentioned, web_queries, latency_ms, created_at, completed_at
          )
          values (
            ${promptId}, ${provider},
            ${provider === "openai" ? "gpt-5-mini" : "claude-sonnet-5"},
            'succeeded',
            ${
              brandMentioned
                ? "aeokit is one of several open-source options. It emphasizes auditable visibility metrics and self-hosting."
                : "Teams can compare several open-source visibility tools based on provider coverage, reporting, and deployment needs."
            },
            ${brandMentioned}, ${competitorsMentioned},
            array['open source AI visibility tools'], ${1_250 + day * 41},
            ${createdAt.toISOString()}, ${new Date(createdAt.getTime() + 1_500).toISOString()}
          )
          returning id
        `;
        if (run && (day + promptIndex) % 2 === 0) {
          await sql`
            insert into citations (
              run_id, url, raw_url, final_url, canonical_url,
              domain, title, position, category
            )
            values
              (${run.id}, 'https://aeokit.dev/docs', 'https://aeokit.dev/docs', 'https://aeokit.dev/docs', 'https://aeokit.dev/docs', 'aeokit.dev', 'aeokit documentation', 0, 'owned'),
              (${run.id}, 'https://reddit.com/r/seo', 'https://www.reddit.com/r/seo', 'https://www.reddit.com/r/seo', 'https://reddit.com/r/seo', 'reddit.com', 'SEO community discussion', 1, 'social')
          `;
        }
      }
    }
  }
}

console.log("Seeded the aeokit starter project");
await closeDatabase();
