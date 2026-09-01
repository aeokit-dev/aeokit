# AeoKit API workflow

Use this reference only when an AeoKit runtime or AeoKit MCP tools are available. The improvement workflow remains useful without them.

1. Use the configured AeoKit MCP server when available. It reads `AEOKIT_URL` (default `http://127.0.0.1:3000`) and sends `Authorization: Bearer $AEOKIT_API_KEY` when configured; never ask the user to paste a key into chat. Resolve the exact project by canonical domain or explicit project ID.
2. Read the project, relevant opportunities, citations, and existing experiments before proposing a change. Preserve evidence IDs and URLs in the claim-to-source ledger.
3. Prefer the namespaced operation tools generated from the runtime's `/openapi.json`. If MCP is unavailable, use `AEOKIT_URL`, the same optional bearer header, and the paths recorded in this bundle's manifest.
4. Creating or updating an experiment and updating an opportunity are separate AeoKit mutations. Perform them only when the user authorizes those state changes. Record the hypothesis, baseline run IDs and metrics, affected URLs, change reference, and evaluation date; report the resulting experiment ID and state.
5. A local website patch does not authorize changing AeoKit records, starting provider runs, publishing, or deploying.

Before any raw mutation, inspect `/openapi.json`; this document intentionally does not duplicate request schemas. Never expose `AEOKIT_API_KEY` or copy credentials into artifacts.
