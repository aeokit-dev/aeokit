#!/usr/bin/env node
import { AeokitClient } from "./client.js";
import { serveAeokitMcp } from "./mcp.js";
import { executeApiTool, loadApiTools } from "./api-tools.js";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "@aeokit/auth";

function usage(): never {
  console.error(`Usage:
  aeokit health [--url URL] [--api-key KEY]
  aeokit projects [--url URL] [--api-key KEY]
  aeokit openapi [--url URL] [--api-key KEY]
  aeokit tools [--url URL] [--api-key KEY]
  aeokit audit PROJECT_ID [--url URL] [--api-key KEY]
  aeokit context PROJECT_ID [--url URL] [--api-key KEY]
  aeokit opportunities PROJECT_ID [--url URL] [--api-key KEY]
  aeokit experiments PROJECT_ID [--url URL] [--api-key KEY]
  aeokit experiment create PROJECT_ID --data JSON [--url URL] [--api-key KEY]
  aeokit experiment evaluate EXPERIMENT_ID --data JSON [--url URL] [--api-key KEY]
  aeokit observe PROJECT_ID --confirm-cost [--url URL] [--api-key KEY]
  aeokit tool NAME [--data JSON] [--url URL] [--api-key KEY]
  aeokit request PATH [--method METHOD] [--data JSON] [--url URL] [--api-key KEY]
  aeokit key create
  aeokit mcp

Environment: AEOKIT_URL, AEOKIT_API_KEY`);
  process.exit(2);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === "mcp") {
    await serveAeokitMcp();
    return;
  }
  if (command === "key" && args[1] === "create") {
    const key = generateApiKey();
    console.log(
      JSON.stringify(
        { key, prefix: apiKeyPrefix(key), hash: await hashApiKey(key) },
        null,
        2,
      ),
    );
    return;
  }
  if (!command) usage();
  const client = new AeokitClient({
    baseUrl: option(args, "--url") ?? process.env.AEOKIT_URL,
    apiKey: option(args, "--api-key") ?? process.env.AEOKIT_API_KEY,
  });
  const projectId = args[1];
  if (["audit", "context"].includes(command)) {
    if (!projectId) usage();
    const [project, prompts, citations, opportunities, experiments] =
      await Promise.all([
        client.request(`/api/projects/${projectId}`),
        client.request(`/api/projects/${projectId}/prompts`),
        client.request(`/api/projects/${projectId}/citations`),
        client.request(`/api/opportunities?projectId=${projectId}&status=all`),
        client.request(`/api/projects/${projectId}/experiments`),
      ]);
    console.log(
      JSON.stringify(
        {
          stage: command === "audit" ? "audit" : "context",
          project,
          prompts,
          citations,
          opportunities,
          experiments,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (["opportunities", "experiments"].includes(command)) {
    if (!projectId) usage();
    const path =
      command === "opportunities"
        ? `/api/opportunities?projectId=${projectId}&status=all`
        : `/api/projects/${projectId}/experiments`;
    console.log(JSON.stringify(await client.request(path), null, 2));
    return;
  }
  if (command === "experiment") {
    const operation = args[1];
    const id = args[2] ?? usage();
    const raw = option(args, "--data") ?? usage();
    const body = JSON.stringify(JSON.parse(raw));
    const path =
      operation === "create"
        ? `/api/projects/${id}/experiments`
        : operation === "evaluate"
          ? `/api/experiments/${id}`
          : usage();
    console.log(
      JSON.stringify(
        await client.request(path, {
          method: operation === "create" ? "POST" : "PATCH",
          body,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "observe") {
    if (!projectId) usage();
    if (!args.includes("--confirm-cost")) {
      throw new Error(
        "observe can spend money; rerun with --confirm-cost after approving provider usage",
      );
    }
    const result = await client.request<{
      prompts: Array<{ id: string; enabled: boolean }>;
    }>(`/api/projects/${projectId}/prompts`);
    const queued = [];
    for (const prompt of result.prompts.filter((item) => item.enabled)) {
      queued.push(
        await client.request(`/api/prompts/${prompt.id}/run`, {
          method: "POST",
          body: "{}",
        }),
      );
    }
    console.log(JSON.stringify({ projectId, queued }, null, 2));
    return;
  }
  if (command === "tools") {
    const tools = await loadApiTools(client);
    console.log(
      JSON.stringify(
        tools.map(
          ({
            name,
            operationId,
            method,
            path,
            description,
            classification,
          }) => ({
            name,
            operationId,
            method,
            path,
            description,
            classification,
          }),
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "tool") {
    const name = args[1] ?? usage();
    const data = option(args, "--data") ?? "{}";
    let input: unknown;
    try {
      input = JSON.parse(data);
    } catch {
      throw new Error("--data must be valid JSON");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("--data must be a JSON object");
    }
    console.log(
      JSON.stringify(
        await executeApiTool(client, name, input as Record<string, unknown>),
        null,
        2,
      ),
    );
    return;
  }
  let path: string;
  let init: RequestInit = {};
  if (command === "health") path = "/api/health";
  else if (command === "projects") path = "/api/projects";
  else if (command === "openapi") path = "/openapi.json";
  else if (command === "request") {
    path = args[1] ?? usage();
    const method = option(args, "--method") ?? "GET";
    const data = option(args, "--data");
    init = { method, ...(data ? { body: data } : {}) };
  } else usage();
  console.log(JSON.stringify(await client.request(path, init), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
