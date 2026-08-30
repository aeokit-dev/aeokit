# Aeokit

Aeokit is the open-source, headless runtime for answer-engine optimization.
It stores auditable AI answers, citations, mentions, competitors, visibility
metrics, and opportunities behind a JSON API that can be used by apps, agents,
CLI tools, MCP clients, and integrations.

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

- Runtime metadata: <http://127.0.0.1:3000/>
- Interactive API docs: <http://127.0.0.1:3000/docs>
- OpenAPI 3.1: <http://127.0.0.1:3000/openapi.json>
- Health: <http://127.0.0.1:3000/api/health>

```sh
curl http://127.0.0.1:3000/
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/projects
```

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

`pnpm dev` starts the API and background worker. The API listens on port 8787
unless `API_PORT` overrides it.

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

- `apps/api` — headless Hono HTTP runtime and OpenAPI documentation
- `apps/worker` — PostgreSQL/pg-boss background execution and scheduling
- `packages/core` — provider-neutral analysis and domain logic
- `packages/db` — PostgreSQL schema and migrations
- `packages/cloudflare-analytics` — portable Cloudflare crawler analytics client

Hosted account login, API-key minting, multitenancy, billing, hosted UI, and
Cloudflare deployment adapters live in the private `aeokit-cloud` control
plane. A hosted client authenticates with a bearer API key; local mode remains
login-free.

See [Architecture](docs/ARCHITECTURE.md), [Security](SECURITY.md), and
[Contributing](CONTRIBUTING.md).

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
