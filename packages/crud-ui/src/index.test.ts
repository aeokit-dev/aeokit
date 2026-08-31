import { describe, expect, it, vi } from "vitest";
import {
  createCrudClient,
  createCrudModel,
  createTableModel,
  loadCrudModel,
  mountCrudUi,
  type OpenApiDocument,
} from "./index";

const apiDocument: OpenApiDocument = {
  openapi: "3.1.0",
  info: { title: "Example API", version: "1" },
  paths: {
    "/api/projects": {
      get: {
        operationId: "listProjects",
        tags: ["Projects"],
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createProject",
        summary: "Create project",
        tags: ["Projects"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProjectInput" },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/projects/{projectId}": {
      parameters: [
        {
          name: "projectId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      delete: {
        operationId: "deleteProject",
        tags: ["Projects"],
        responses: { "204": { description: "Deleted" } },
      },
    },
  },
  components: {
    schemas: {
      ProjectInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", title: "Project name" },
          enabled: { type: "boolean", default: true },
          provider: { type: "string", enum: ["openai", "anthropic"] },
        },
      },
    },
  },
};

describe("OpenAPI-driven CRUD model", () => {
  it("discovers every operation and resolves schemas without an endpoint list", () => {
    const model = createCrudModel(apiDocument);

    expect(model.groups).toHaveLength(1);
    expect(model.operations.map(({ id }) => id)).toEqual([
      "listProjects",
      "createProject",
      "deleteProject",
    ]);
    expect(model.operations[1]?.bodySchema).toEqual(
      apiDocument.components?.schemas?.ProjectInput,
    );
    expect(model.operations[2]).toMatchObject({
      destructive: true,
      parameters: [{ name: "projectId", location: "path", required: true }],
    });
  });

  it("loads the current contract at runtime so later endpoints appear", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(apiDocument), {
        headers: { "content-type": "application/json" },
      }),
    );

    const model = await loadCrudModel({
      openApiUrl: "https://cloud.example/openapi.json",
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://cloud.example/openapi.json",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(model.operations).toHaveLength(3);
  });
});

describe("CRUD API client", () => {
  it("substitutes path/query values, sends JSON, and preserves shell auth", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "project-1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createCrudClient({
      apiBaseUrl: "https://cloud.example/",
      fetchFn,
      headers: () => ({ Authorization: "Bearer shell-token" }),
    });
    const operation = createCrudModel(apiDocument).operations[1]!;

    const result = await client.execute(operation, {
      parameters: { preview: "true" },
      body: { name: "Acme" },
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, request] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://cloud.example/api/projects");
    expect(request).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "Acme" }),
    });
    const headers = new Headers(request?.headers);
    expect(headers.get("authorization")).toBe("Bearer shell-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(result).toMatchObject({
      ok: true,
      status: 201,
      data: { id: "project-1" },
    });
  });
});

describe("CRUD table model", () => {
  it("unwraps collection responses and chooses useful columns", () => {
    expect(
      createTableModel({
        projects: [
          { id: "project-1", name: "Acme", archivedAt: null },
          { id: "project-2", name: "Beta", archivedAt: "2026-08-01" },
        ],
      }),
    ).toEqual({
      columns: ["id", "name", "archivedAt"],
      rows: [
        { id: "project-1", name: "Acme", archivedAt: null },
        { id: "project-2", name: "Beta", archivedAt: "2026-08-01" },
      ],
    });
  });
});

describe("mounted CRUD UI", () => {
  it("renders resource navigation, a collection table, and focused forms", async () => {
    const root = document.createElement("main");
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(apiDocument), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ projects: [{ id: "project-1", name: "Acme" }] }),
          { headers: { "content-type": "application/json" } },
        ),
      );

    const unmount = await mountCrudUi(root, { fetchFn });
    await vi.waitFor(() => expect(root.querySelector("tbody")).not.toBeNull());

    expect(root.querySelector('[aria-label="Resources"]')).not.toBeNull();
    expect(root.textContent).toContain("Acme");
    expect(root.querySelectorAll("form")).toHaveLength(2);
    expect(root.querySelector('[data-field="name"]')).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(root.querySelector('[data-field="provider"]')).toBeInstanceOf(
      HTMLSelectElement,
    );
    expect(
      root.querySelector('[data-operation-id="deleteProject"] button')
        ?.textContent,
    ).toBe("Delete");
    expect(
      root
        .querySelector('[data-operation-id="deleteProject"] button')
        ?.classList.contains("aeokit-crud__danger"),
    ).toBe(true);

    unmount();
    expect(root.childElementCount).toBe(0);
  });
});
