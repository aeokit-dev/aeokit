# @aeokit/cli

Use the Aeokit API from a terminal or expose it as an MCP stdio server.

The lifecycle commands are `audit`, `context`, `opportunities`, `experiments`,
`experiment create`, `experiment evaluate`, and `observe`. Because observation
queues enabled provider prompts, it requires explicit `--confirm-cost`.

```sh
aeokit audit PROJECT_ID
aeokit observe PROJECT_ID --confirm-cost
aeokit experiment create PROJECT_ID --data '{"name":"Improve evidence","hypothesis":"A sourced comparison increases citations."}'
aeokit experiment evaluate EXPERIMENT_ID --data '{"status":"inconclusive"}'
```

```sh
npx --yes @aeokit/cli@0.1.0 health

AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
npx --yes @aeokit/cli@0.1.0 projects

AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
npx --yes @aeokit/cli@0.1.0 mcp
```

The MCP server reads `${AEOKIT_URL}/openapi.json` at startup and turns every
documented API operation into a namespaced tool. The API contract supplies the
tool name, typed path/query/body inputs, description, and safety metadata, so
MCP does not maintain a separate endpoint list. The stable `aeokit_health`,
`aeokit_list_projects`, and read-only `aeokit_get` tools remain available for
compatibility. Requests use `Authorization: Bearer
${AEOKIT_API_KEY}` when a key is configured; local mode can remain
unauthenticated.

The same generated operation catalog is reusable outside MCP:

```sh
aeokit tools
aeokit tool aeokit_getProjects --data '{}'
aeokit tool aeokit_getProjectsByProjectIdRuns \
  --data '{"projectId":"00000000-0000-0000-0000-000000000000"}'
```

JavaScript consumers can import `loadApiTools`, `executeApiTool`, or
`apiToolsFromOpenApi` from `@aeokit/cli/api-tools`. Inputs are validated before
an HTTP request is made.

Running AeoKit also exposes this same server over MCP Streamable HTTP at
`${AEOKIT_URL}/api/mcp`. In API-key mode, configure the MCP client with the
`Authorization: Bearer ${AEOKIT_API_KEY}` header. The `aeokit mcp` command
remains the stdio transport for local process-based clients.

Install it when you want a persistent `aeokit` command or the JavaScript
client:

```sh
npm install --global @aeokit/cli@0.1.0
aeokit health
```

```js
import { AeokitClient } from "@aeokit/cli";

const client = new AeokitClient({
  baseUrl: process.env.AEOKIT_URL,
  apiKey: process.env.AEOKIT_API_KEY,
});
const { projects } = await client.request("/api/projects");
```

For an opt-in self-hosted authenticated runtime, generate a key locally:

```sh
npx --yes @aeokit/cli@0.1.0 key create
```

Put the returned `hash` in `AEOKIT_API_KEY_HASHES`; give the one-time `key`
to clients as `AEOKIT_API_KEY`.
