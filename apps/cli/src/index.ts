#!/usr/bin/env node
import { AeokitClient } from "./client.js";
import { serveAeokitMcp } from "./mcp.js";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "@aeokit/auth";

function usage(): never {
  console.error(`Usage:
  aeokit health [--url URL] [--api-key KEY]
  aeokit projects [--url URL] [--api-key KEY]
  aeokit openapi [--url URL] [--api-key KEY]
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
