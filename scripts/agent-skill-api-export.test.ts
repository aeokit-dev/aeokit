import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntimeApp } from "../apps/api/src/runtime";
import { apiToolsFromOpenApi } from "../apps/cli/src/mcp";

type ExportManifest = {
  schemaVersion: number;
  apiVersion: string;
  files: Array<{
    source: string;
    destination: string;
    operations: string[];
  }>;
};

const exportRoot = path.resolve("agent-skills/api-export");

describe("agent skill API export", () => {
  it("contains portable workflow files backed by real OpenAPI operations", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(exportRoot, "manifest.json"), "utf8"),
    ) as ExportManifest;
    const response = await createRuntimeApp().request(
      "http://localhost/openapi.json",
    );
    const openapi = (await response.json()) as {
      info: { version: string };
      paths: Record<string, Record<string, unknown>>;
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.apiVersion).toBe(openapi.info.version);
    expect(manifest.files).toHaveLength(3);

    const documentedOperations = Object.values(openapi.paths).reduce(
      (count, pathItem) =>
        count +
        Object.keys(pathItem).filter((method) =>
          ["get", "post", "put", "patch", "delete"].includes(method),
        ).length,
      0,
    );
    const mcpTools = apiToolsFromOpenApi(
      openapi as never,
      {
        request: async () => ({}),
      } as never,
    );
    expect(mcpTools).toHaveLength(documentedOperations);
    expect(new Set(mcpTools.map((tool) => tool.name)).size).toBe(
      documentedOperations,
    );

    for (const file of manifest.files) {
      expect(file.source).not.toContain("..");
      expect(file.destination).toMatch(
        /^skills\/(aeo-audit|aeo-improve|aeo-observe)\/api\/aeokit\.md$/,
      );
      await expect(
        readFile(path.join(exportRoot, file.source), "utf8"),
      ).resolves.toContain("# AeoKit API workflow");
      for (const operation of file.operations) {
        const [method, operationPath] = operation.split(" ");
        expect(
          openapi.paths[operationPath!]?.[method!.toLowerCase()],
          `${operation} is not present in OpenAPI`,
        ).toBeDefined();
      }
    }
  });
});
