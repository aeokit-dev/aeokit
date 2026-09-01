import { z } from "zod";
import type { AeokitClient } from "./client.js";

export type OpenApiSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  additionalProperties?: boolean | OpenApiSchema;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  $ref?: string;
};

export type OpenApiParameter = {
  name?: string;
  in?: "path" | "query" | "header" | "cookie" | string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
};

export type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
  "x-aeokit-mcp"?: {
    confirmation?: string;
    cost?: boolean;
    destructive?: boolean;
  };
};

export type OpenApiDocument = {
  paths?: Record<
    string,
    Record<string, OpenApiOperation | OpenApiParameter[] | undefined>
  >;
  components?: { schemas?: Record<string, OpenApiSchema> };
};

export type ApiToolInput = Record<string, unknown> & {
  query?: Record<string, unknown>;
  body?: unknown;
};

export type ApiToolClassification = {
  access: "read" | "write";
  destructive: boolean;
  cost: boolean;
  confirmation: string | undefined;
};

export type ApiTool = {
  name: string;
  operationId: string;
  method: string;
  path: string;
  description: string;
  inputSchema: z.ZodObject;
  classification: ApiToolClassification;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  execute(input: ApiToolInput): Promise<unknown>;
};

const methods = ["get", "post", "put", "patch", "delete"] as const;
const queryValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

function resolveSchema(
  schema: OpenApiSchema | undefined,
  document: OpenApiDocument,
  seen = new Set<string>(),
): OpenApiSchema {
  if (!schema?.$ref) return schema ?? {};
  const prefix = "#/components/schemas/";
  if (!schema.$ref.startsWith(prefix) || seen.has(schema.$ref)) return {};
  const name = decodeURIComponent(schema.$ref.slice(prefix.length));
  const resolved = document.components?.schemas?.[name];
  if (!resolved) return {};
  seen.add(schema.$ref);
  return resolveSchema(resolved, document, seen);
}

function schemaToZod(
  source: OpenApiSchema | undefined,
  document: OpenApiDocument,
): z.ZodType {
  const schema = resolveSchema(source, document);
  let validator: z.ZodType;

  if (schema.const !== undefined) validator = z.literal(schema.const as never);
  else if (schema.enum?.length) {
    const values = schema.enum;
    validator = z.custom(
      (value) => values.some((item) => Object.is(item, value)),
      {
        message: `Expected one of: ${values.map(String).join(", ")}`,
      },
    );
  } else if (schema.oneOf?.length || schema.anyOf?.length) {
    const alternatives = (schema.oneOf ?? schema.anyOf)!.map((item) =>
      schemaToZod(item, document),
    );
    validator = z.union(alternatives as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  } else if (schema.allOf?.length) {
    const [first, ...rest] = schema.allOf.map((item) =>
      schemaToZod(item, document),
    );
    validator = rest.reduce(
      (left, right) => z.intersection(left, right),
      first!,
    );
  } else {
    const type = Array.isArray(schema.type)
      ? schema.type.find((item) => item !== "null")
      : schema.type;
    switch (type) {
      case "string": {
        let stringSchema = z.string();
        if (schema.format === "uuid") stringSchema = stringSchema.uuid();
        if (schema.format === "date-time")
          stringSchema = stringSchema.datetime();
        if (schema.format === "date") stringSchema = stringSchema.date();
        if (schema.minLength !== undefined)
          stringSchema = stringSchema.min(schema.minLength);
        if (schema.maxLength !== undefined)
          stringSchema = stringSchema.max(schema.maxLength);
        if (schema.pattern)
          stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        validator = stringSchema;
        break;
      }
      case "integer":
      case "number": {
        let numberSchema = type === "integer" ? z.number().int() : z.number();
        if (schema.minimum !== undefined)
          numberSchema = numberSchema.min(schema.minimum);
        if (schema.maximum !== undefined)
          numberSchema = numberSchema.max(schema.maximum);
        validator = numberSchema;
        break;
      }
      case "boolean":
        validator = z.boolean();
        break;
      case "array": {
        let arraySchema = z.array(schemaToZod(schema.items, document));
        if (schema.minItems !== undefined)
          arraySchema = arraySchema.min(schema.minItems);
        if (schema.maxItems !== undefined)
          arraySchema = arraySchema.max(schema.maxItems);
        validator = arraySchema;
        break;
      }
      case "object": {
        const shape: Record<string, z.ZodType> = {};
        const required = new Set(schema.required ?? []);
        for (const [name, property] of Object.entries(
          schema.properties ?? {},
        )) {
          const propertyValidator = schemaToZod(property, document);
          shape[name] = required.has(name)
            ? propertyValidator
            : propertyValidator.optional();
        }
        let objectSchema = z.object(shape);
        if (schema.additionalProperties === false)
          objectSchema = objectSchema.strict();
        validator = objectSchema;
        break;
      }
      default:
        validator = z.unknown();
    }
  }

  if (schema.description) validator = validator.describe(schema.description);
  if (
    schema.nullable ||
    (Array.isArray(schema.type) && schema.type.includes("null"))
  ) {
    validator = validator.nullable();
  }
  return validator;
}

function appendQuery(path: string, query: Record<string, unknown>) {
  const parameters = new URLSearchParams();
  for (const [name, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) parameters.append(name, String(value));
  }
  const encoded = parameters.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function apiToolsFromOpenApi(
  document: OpenApiDocument,
  client: Pick<AeokitClient, "request">,
): ApiTool[] {
  const tools: ApiTool[] = [];
  const names = new Set<string>();

  for (const [pathTemplate, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathTemplate.startsWith("/api/")) continue;
    const sharedParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : [];
    for (const method of methods) {
      const operation = pathItem[method] as OpenApiOperation | undefined;
      if (!operation?.operationId) continue;
      const name = `aeokit_${operation.operationId}`;
      if (names.has(name)) throw new Error(`duplicate MCP tool name '${name}'`);
      names.add(name);

      const parameters = [...sharedParameters, ...(operation.parameters ?? [])];
      const shape: Record<string, z.ZodType> = {};
      for (const parameter of parameters) {
        if (!parameter.name || !["path", "query"].includes(parameter.in ?? ""))
          continue;
        let validator = schemaToZod(parameter.schema, document);
        if (parameter.description)
          validator = validator.describe(parameter.description);
        shape[parameter.name] =
          parameter.required || parameter.in === "path"
            ? validator
            : validator.optional();
      }
      shape.query = z
        .record(z.string(), queryValue)
        .optional()
        .describe(
          "Undocumented query parameters; prefer the named OpenAPI-derived inputs",
        );
      if (operation.requestBody) {
        const bodySchema =
          operation.requestBody.content?.["application/json"]?.schema;
        const validator = schemaToZod(bodySchema, document);
        shape.body = operation.requestBody.required
          ? validator
          : validator.optional();
      }
      const inputSchema = z.object(shape).strict();

      const metadata = operation["x-aeokit-mcp"];
      const readOnly = method === "get";
      const classification: ApiToolClassification = {
        access: readOnly ? "read" : "write",
        destructive: metadata?.destructive ?? method === "delete",
        cost: metadata?.cost ?? false,
        confirmation: metadata?.confirmation,
      };
      const safety = classification.confirmation
        ? ` ${classification.confirmation}`
        : readOnly
          ? ""
          : " This operation changes AeoKit state.";
      const description = `${operation.summary ?? operation.description ?? `${method.toUpperCase()} ${pathTemplate}`}.${safety}`;

      tools.push({
        name,
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path: pathTemplate,
        description,
        inputSchema,
        classification,
        annotations: {
          readOnlyHint: readOnly,
          destructiveHint: classification.destructive,
          idempotentHint: ["get", "put", "delete"].includes(method),
          openWorldHint: classification.cost,
        },
        async execute(rawInput: ApiToolInput) {
          const input = inputSchema.parse(rawInput) as ApiToolInput;
          let requestPath = pathTemplate;
          const query = { ...(input.query ?? {}) };
          for (const parameter of parameters) {
            if (!parameter.name) continue;
            if (parameter.in === "path") {
              requestPath = requestPath.replace(
                `{${parameter.name}}`,
                encodeURIComponent(String(input[parameter.name])),
              );
            } else if (
              parameter.in === "query" &&
              input[parameter.name] !== undefined
            ) {
              query[parameter.name] = input[parameter.name];
            }
          }
          requestPath = appendQuery(requestPath, query);
          return client.request(requestPath, {
            method: method.toUpperCase(),
            ...(operation.requestBody
              ? { body: JSON.stringify(input.body) }
              : {}),
          });
        },
      });
    }
  }
  return tools;
}

export async function loadApiTools(client: Pick<AeokitClient, "request">) {
  const document = await client.request<OpenApiDocument>("/openapi.json");
  return apiToolsFromOpenApi(document, client);
}

export async function executeApiTool(
  client: Pick<AeokitClient, "request">,
  name: string,
  input: ApiToolInput,
) {
  const tool = (await loadApiTools(client)).find(
    (candidate) => candidate.name === name,
  );
  if (!tool) throw new Error(`Unknown AeoKit API tool '${name}'`);
  return tool.execute(input);
}
