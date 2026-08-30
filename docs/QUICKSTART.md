# Five-minute quickstart

This path starts the open-source Aeokit runtime locally, verifies its API, and
creates a project. Reading and writing local configuration does not call an AI
provider and does not spend money.

## 1. Start the runtime

Requirements: Docker with Compose, and Node.js 24 or newer for the CLI.

```sh
git clone https://github.com/aeokit-dev/aeokit.git
cd aeokit
cp .env.example .env
docker compose -p openaeo up -d --build app
```

The command starts PostgreSQL, applies migrations, and exposes the API only on
`127.0.0.1:3000`. Wait for the health check:

```sh
npx --yes @aeokit/cli@0.1.0 health
```

Expected response:

```json
{
  "ok": true,
  "service": "aeokit-runtime"
}
```

Open the interactive API reference at <http://127.0.0.1:3000/docs> or fetch
the OpenAPI 3.1 document:

```sh
npx --yes @aeokit/cli@0.1.0 openapi > /tmp/aeokit-openapi.json
```

## 2. Create and inspect a project

The generic `request` command covers the complete JSON API:

```sh
npx --yes @aeokit/cli@0.1.0 request /api/projects \
  --method POST \
  --data '{"name":"Acme","website":"https://example.com","aliases":[],"additionalDomains":[]}'

npx --yes @aeokit/cli@0.1.0 projects
```

Copy the returned project `id` when calling project-specific endpoints.

## 3. Use the JavaScript client

```sh
npm install @aeokit/cli@0.1.0
```

```js
import { AeokitClient } from "@aeokit/cli";

const aeokit = new AeokitClient({
  baseUrl: "http://127.0.0.1:3000",
});

const { projects } = await aeokit.request("/api/projects");
console.log(projects);
```

For Aeokit Cloud, set `baseUrl` to `https://cloud.aeokit.dev` and pass the key
minted in the control plane as `apiKey`. Never commit an `aeo_live_...` key.

## 4. Connect an MCP host

Configure Claude, Codex, or another stdio MCP host to launch:

```json
{
  "command": "npx",
  "args": ["--yes", "@aeokit/cli@0.1.0", "mcp"],
  "env": {
    "AEOKIT_URL": "http://127.0.0.1:3000"
  }
}
```

The MCP server exposes health, project listing, and read-only API requests.
Hosted clients use the same command with `AEOKIT_URL` and `AEOKIT_API_KEY` in
the MCP process environment.

## 5. Run an analysis (optional and billable)

Provider-backed analysis requires the worker and at least one provider key in
`.env`:

```sh
docker compose -p openaeo up -d --build worker
```

Create a prompt with a target supported by your configured provider, then call
`POST /api/prompts/{promptId}/run`. Provider calls may spend money. Inspect the
result through `GET /api/runs/{runId}`, and project visibility through
`GET /api/projects/{projectId}/visibility`.

The current request shapes and available provider/model combinations are
always documented by the running instance at `/docs` and `/openapi.json`.

## Shut down

```sh
docker compose -p openaeo down
```

The named PostgreSQL volume is retained, so the next start reuses the same
dataset. Delete the volume only when you intentionally want to erase local
Aeokit data.
