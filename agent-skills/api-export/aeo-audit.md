# AeoKit API workflow

Use this reference only when an AeoKit runtime or AeoKit MCP tools are available. The audit remains useful without them.

1. Use the configured AeoKit MCP server when available. It reads `AEOKIT_URL` (default `http://127.0.0.1:3000`) and sends `Authorization: Bearer $AEOKIT_API_KEY` when a key is configured; never ask the user to paste a key into chat.
2. Check runtime health, then list projects and match the canonical domain or explicit project ID. Never guess among multiple plausible projects. The MCP generates a namespaced tool for every operation in the runtime's `/openapi.json`; prefer those operation tools over manually constructing endpoints.
3. Read the project, crawler-traffic history, citations, and opportunities relevant to the audited question. Preserve returned IDs, timestamps, provider/surface labels, URLs, and evidence status.
4. Treat missing access, empty history, and request failures as different outcomes. Do not turn an unavailable AeoKit check into a pass.
5. Keep AeoKit records separate from public HTTP checks and repository observations in the evidence ledger.

If MCP is unavailable, use `AEOKIT_URL` as the base URL, the same optional bearer header, and the operations recorded in this bundle's manifest. Inspect `/openapi.json` rather than inventing request fields. Never expose `AEOKIT_API_KEY` or copy credentials into reports.
