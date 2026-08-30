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

`pnpm dev` starts the API and background worker. The API listens on port 8787
unless `API_PORT` overrides it.

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

It exposes health, project listing, and read-only API tools. Claude, Codex, and
other MCP hosts can launch that command without a separate Aeokit login flow.

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
