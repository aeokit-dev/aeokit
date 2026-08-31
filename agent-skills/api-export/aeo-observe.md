# AeoKit API workflow

Use this reference only when an AeoKit runtime or AeoKit MCP tools are available. The observation workflow remains useful without them.

1. Use the configured AeoKit MCP server when available. It reads `AEOKIT_URL` (default `http://127.0.0.1:3000`) and sends `Authorization: Bearer $AEOKIT_API_KEY` when configured; never ask the user to paste a key into chat. Check runtime health, resolve the exact project, and read its prompt corpus before starting anything.
2. Preserve prompt text, IDs, provider and surface settings, locale, and existing run metadata. Do not silently rewrite the corpus for a comparison.
3. Starting a prompt run can spend money and mutate runtime state. Obtain the authorization and cost/sample ceiling required by the parent skill before calling the run operation.
4. After an authorized run, retrieve its run record and the project's runs, visibility, and citations. Preserve failures and incomplete runs instead of counting them as negative mentions.
5. Compare only compatible records and retain AeoKit IDs so another operator can reproduce the report.

Prefer the namespaced operation tools generated from `/openapi.json`. If MCP is unavailable, use `AEOKIT_URL`, the same optional bearer header, and the operations recorded in this bundle's manifest; inspect `/openapi.json` for current request schemas. Never expose `AEOKIT_API_KEY` or copy credentials into reports.
