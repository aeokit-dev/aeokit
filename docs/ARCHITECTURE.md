# Architecture

Aeokit is a headless runtime with portable domain logic and a PostgreSQL-backed
local/self-hosted adapter.

## Components

- `apps/api` exposes the JSON API, runtime metadata, health endpoint, and
  OpenAPI 3.1 reference.
- `apps/worker` executes queued provider runs and scheduled maintenance.
- `packages/core` contains analysis, metrics, provider clients, evidence
  processing, and recommendations.
- `packages/db` owns the PostgreSQL schema and migrations.
- `packages/cloudflare-analytics` is a portable client for crawler analytics;
  it is not a deployment adapter.

## Request and job flow

1. A client creates projects, prompts, and targets through `/api`.
2. The API persists configuration in PostgreSQL and enqueues work with
   `pg-boss`.
3. The worker calls configured providers and stores raw answers, citations,
   costs, and normalized evidence.
4. The API calculates visibility, share of voice, opportunity, and reliability
   views from stored evidence.

Provider secrets remain server-side. External provider calls occur only when a
run is requested or becomes due.

## Authentication boundary

Local mode binds to loopback and does not require login. Hosted control planes
authenticate users, mint workspace API keys, and pass a verified tenant context
to hosted adapters. Those hosted concerns live outside this repository.

All clients should converge on the same HTTP contract:

```text
web app ─┐
CLI ─────┤
MCP ─────┼── bearer key or local no-auth ── Aeokit API
agents ──┘
```

## Hosted adapters

`aeokit-cloud` imports portable Aeokit packages and supplies Cloudflare D1, R2,
Workflow/Cron, Clerk identity, tenant isolation, and API-key management. The
dependency direction is one-way: this runtime never imports the hosted control
plane.
