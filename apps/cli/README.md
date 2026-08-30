# @aeokit/cli

Use the Aeokit API from a terminal or expose it as an MCP stdio server.

```sh
AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
aeokit projects

AEOKIT_URL=https://cloud.aeokit.dev \
AEOKIT_API_KEY=aeo_live_... \
aeokit mcp
```

For an opt-in self-hosted authenticated runtime, generate a key locally:

```sh
aeokit key create
```

Put the returned `hash` in `AEOKIT_API_KEY_HASHES`; give the one-time `key`
to clients as `AEOKIT_API_KEY`.
