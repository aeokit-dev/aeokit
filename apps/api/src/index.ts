import { serve } from "@hono/node-server";
import { stopQueue } from "./queue";
import { closeDatabase } from "@openaeo/db";
import { createRuntimeApp } from "./runtime";

const app = createRuntimeApp();

const port = Number(process.env.API_PORT ?? 8787);
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`aeokit API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await stopQueue();
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
