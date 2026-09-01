# AeoKit agent tool integration

`aeokit-agent` should consume the shared contract from `@aeokit/cli/api-tools`;
it should not copy AeoKit routes or MCP registration logic.

## Runtime contract

- Configure `AEOKIT_URL` (default `http://127.0.0.1:3000`) and, when required,
  `AEOKIT_API_KEY`.
- Fetch `GET /openapi.json` once when constructing an agent tool set, or call
  `loadApiTools(client)`, which does that fetch and returns the catalog.
- Each documented `/api/` operation with an `operationId` becomes
  `aeokit_${operationId}`. Tool names therefore follow the running server's
  contract rather than a separately versioned list.
- Tool inputs flatten documented path and query parameters by parameter name.
  JSON request bodies use the `body` property. The optional `query` object is a
  compatibility escape hatch for query fields absent from the OpenAPI document.
- Path values are URI-component encoded. Array query values are emitted as
  repeated keys. The method, path substitution, query serialization, JSON body,
  bearer authentication, and error handling are performed by the shared layer.
- Zod schemas are derived from OpenAPI primitives, objects, arrays, required
  fields, enums, bounds, formats, unions/intersections, nullable values, and
  local `#/components/schemas/*` references. `execute` rejects invalid inputs
  before any API request.

## Safety contract

Every generated tool exposes `classification`:

```ts
{
  access: "read" | "write";
  destructive: boolean;
  cost: boolean;
  confirmation: string | undefined;
}
```

`GET` is read access; other supported methods are writes. `DELETE` is
destructive by default. OpenAPI `x-aeokit-mcp.destructive`, `.cost`, and
`.confirmation` override or add operation-specific risk. MCP annotations map
these to `readOnlyHint`, `destructiveHint`, `idempotentHint`, and
`openWorldHint`. The agent must require explicit user authorization described
by `confirmation` before a state-changing, destructive, or cost-bearing call;
annotations are hints, not an enforcement boundary.

## Integration options

For native tool adapters:

```ts
import { AeokitClient } from "@aeokit/cli";
import { loadApiTools } from "@aeokit/cli/api-tools";

const client = new AeokitClient({
  baseUrl: process.env.AEOKIT_URL,
  apiKey: process.env.AEOKIT_API_KEY,
});
const tools = await loadApiTools(client);
// Adapt each tool's name, description, inputSchema, classification, and execute.
```

For MCP, launch `aeokit mcp`. It registers the generated catalog plus the
stable explicit tools `aeokit_health`, `aeokit_list_projects`, and the safe
generic read fallback `aeokit_get`. The fallback accepts only relative `/api`
paths and always performs GET; it cannot issue arbitrary writes or target a
different host.

For ACP client-provided HTTP MCP configuration, connect to the runtime's
absolute `/api/mcp` URL (for example `https://cloud.aeokit.dev/api/mcp`) using
the MCP **Streamable HTTP** transport. Send the same API key as
`Authorization: Bearer ${AEOKIT_API_KEY}`. The endpoint accepts MCP 2025-era
stateless Streamable HTTP (`initialize`, notifications, `tools/list`, and
`tools/call`) and the SDK's newer per-request protocol; responses may be JSON
or `text/event-stream`, so clients must negotiate both with `Accept:
application/json, text/event-stream`. POST JSON-RPC requests with
`Content-Type: application/json`; after initialization, include the negotiated
`MCP-Protocol-Version` header as required by the protocol. GET/DELETE have the
standard stateless transport behavior and are not needed for tool calls.

`/api/mcp` is beneath the runtime's existing `/api/*` authentication
middleware. API-key mode rejects a missing or invalid bearer token with HTTP
401 before MCP dispatch; intentionally unauthenticated local mode remains
unauthenticated. Tool calls are dispatched back through the same runtime and
bearer boundary, and use exactly the same generated catalog as stdio MCP and
the native adapter.

The catalog is startup-time state. Rebuild it after the runtime contract
changes or after reconnecting to a different AeoKit instance.
