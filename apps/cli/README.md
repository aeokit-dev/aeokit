# @aeokit/cli

Use the Aeokit API from a terminal or expose it as an MCP stdio server.

```sh
npx --yes @aeokit/cli@0.1.0 health

AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
npx --yes @aeokit/cli@0.1.0 projects

AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
npx --yes @aeokit/cli@0.1.0 mcp
```

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
