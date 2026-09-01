# Aeokit

Aeokit is the open-source runtime and product UI for answer-engine optimization.
It stores auditable AI answers, citations, mentions, competitors, visibility
metrics, and opportunities behind a JSON API that can be used by apps, agents,
CLI tools, MCP clients, and integrations. The complete dashboard is bundled
with the same runtime and remains optional for agent-only deployments.

## Why answer-engine optimization is different

SEO competes to rank a page. AEO competes to make useful evidence available to
an AI-generated answer.

An answer engine with live web retrieval can cite a newly published source as
soon as it discovers that source and finds it relevant. The site does not
necessarily have to build months of ranking history first. Inclusion is never
guaranteed, and answer engines that rely on conventional search indexes still
depend on sound technical SEO, but the feedback loop can be much shorter for
original facts, research, product information, and narrowly focused questions.

Aeokit makes that feedback loop observable. Use scheduled prompt runs,
citations, mentions, and crawler traffic to follow a source from publication to
its first appearance in an AI answer—and keep the evidence behind every
result.

The canonical agent lifecycle is:

```text
audit -> observe baseline -> improve -> record experiment -> observe again -> evaluate
```

```text
publish -> AI crawler visit -> first mention -> first citation
```

This "zero to cited" workflow is a practical way to compare AI visibility with
traditional search visibility without treating either one as guaranteed.

The runtime is licensed under the GNU Affero General Public License v3.0.

## Local quick start

The supported local path uses Docker Compose and the persistent PostgreSQL
volume. The API is unauthenticated and bound to loopback only.

```sh
cp .env.example .env
# Add provider credentials only when you intend to run provider requests.
docker compose -p openaeo up -d --build app worker
```

Then open or query:

- Full local product UI: <http://127.0.0.1:3000/app>
- Project experiments: `http://127.0.0.1:3000/app/brands/<project-id>/experiments`
- Runtime metadata: <http://127.0.0.1:3000/>
- Interactive API docs: <http://127.0.0.1:3000/docs>
- OpenAPI 3.1: <http://127.0.0.1:3000/openapi.json>
- Health: <http://127.0.0.1:3000/api/health>

```sh
curl http://127.0.0.1:3000/
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/projects
```

In a second terminal, verify the installed public CLI against the local
runtime—no repository checkout or login is required:

```sh
npx --yes @aeokit/cli@0.1.0 health
npx --yes @aeokit/cli@0.1.0 projects
```

Continue with the [five-minute quickstart](docs/QUICKSTART.md) to create a
project, connect JavaScript or MCP, and optionally run a provider-backed
analysis.

PostgreSQL is also loopback-only at `127.0.0.1:5433`. Do not broaden either
binding without an authenticated access boundary.

## Native development

Use Node 24 and pnpm 10:

```sh
corepack enable
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm dev` starts the API and background worker. Build the UI with
`pnpm --filter @aeokit/product-ui build`; the API serves it at `/app`. The API
listens on port 8787 unless `API_PORT` overrides it.

## CLI, MCP, and API-key mode

The published CLI and MCP stdio server use the same runtime URL and bearer
key:

```sh
AEOKIT_URL=http://127.0.0.1:3000 npx --yes @aeokit/cli@0.1.0 health
AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
npx --yes @aeokit/cli@0.1.0 projects
```

Local mode remains unauthenticated. To protect a networked self-hosted runtime,
generate a key, keep the displayed secret, and configure only its hash:

```sh
npx --yes @aeokit/cli@0.1.0 key create
# Set AEOKIT_AUTH_MODE=api-key and AEOKIT_API_KEY_HASHES=<returned hash>
```

Start the stdio MCP server with the same environment:

```sh
AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
npx --yes @aeokit/cli@0.1.0 mcp
```

ACP and other remote MCP clients can instead use the runtime's Streamable HTTP
endpoint at `https://<aeokit-runtime>/api/mcp`, passing the same API key in the
`Authorization: Bearer ...` header.

At startup it reads the runtime's OpenAPI document and exposes every documented
API operation as a namespaced MCP tool. Claude, Codex, and other MCP hosts gain
new API operations without a second hand-maintained MCP route list. The API's
OpenAPI metadata labels read-only, destructive, state-changing, and potentially
cost-bearing operations; `aeokit_get` remains as a read-only compatibility
escape hatch.

API-specific guidance for the portable `aeokit-skills` plugin lives in
`agent-skills/api-export`. Its manifest maps each source document to its
packaged destination. Tests verify every recorded operation against AeoKit's
generated OpenAPI document, so endpoint changes cannot silently leave the
published guidance stale. The distribution repository imports this directory
during release; end users install the complete Claude or Codex plugin from
`aeokit-skills` and do not fetch these files at runtime.

Native agent integrations can reuse the same validated operation catalog; see
[AeoKit agent tool integration](docs/AEOKIT_AGENT_INTEGRATION.md) for the exact
input, execution, and safety contract.

## Provider configuration

Provider keys stay in the runtime environment. Common variables include:

- `BRIGHTDATA_API_KEY`
- `BRIGHTDATA_SERP_ZONE`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DATAFORSEO_API_KEY`

Calls to external providers may spend money. Starting the runtime or querying
existing data does not initiate a provider run by itself.

## Architecture

The portable repository contains:

- `apps/api` — Hono HTTP runtime, UI delivery, and OpenAPI documentation
- `apps/web` — complete self-hosted dashboard and reusable product application
- `apps/worker` — PostgreSQL/pg-boss background execution and scheduling
- `packages/core` — provider-neutral analysis and domain logic
- `packages/db` — PostgreSQL schema and migrations
- `packages/cloudflare-analytics` — portable Cloudflare crawler analytics client

Hosted account login, API-key minting, multitenancy, billing, and Cloudflare
deployment adapters live in the private `aeokit-cloud` control plane. Cloud
wraps the public product application with those hosted capabilities; it does
not own a separate product dashboard. Local mode remains login-free, and the
API, CLI, and MCP interfaces continue to work without opening the UI.

See [Architecture](docs/ARCHITECTURE.md), [Security](SECURITY.md), and
[Contributing](CONTRIBUTING.md). The [agent optimization workflow](docs/AGENT_OPTIMIZATION_WORKFLOW.md)
shows the complete audit-to-evaluation lifecycle.

## Commands

```sh
pnpm test
pnpm typecheck
pnpm format:check
pnpm build
```

## License

Copyright © Aeokit contributors. Licensed under the
[GNU Affero General Public License v3.0](LICENSE).
