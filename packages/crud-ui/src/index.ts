export interface OpenApiSchema {
  $ref?: string;
  type?: string | readonly string[];
  title?: string;
  description?: string;
  format?: string;
  enum?: readonly unknown[];
  default?: unknown;
  properties?: Record<string, OpenApiSchema>;
  required?: readonly string[];
  items?: OpenApiSchema;
  additionalProperties?: boolean | OpenApiSchema;
  [key: string]: unknown;
}

export interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: readonly string[];
  parameters?: readonly (OpenApiParameter | { $ref: string })[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: OpenApiSchema }>;
    }
  >;
  [key: string]: unknown;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<
    string,
    Record<string, OpenApiOperation | readonly OpenApiParameter[] | undefined>
  >;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    parameters?: Record<string, OpenApiParameter>;
    [key: string]: unknown;
  };
}

export interface CrudParameter {
  name: string;
  location: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema: OpenApiSchema;
}

export interface CrudOperation {
  id: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  group: string;
  destructive: boolean;
  parameters: CrudParameter[];
  bodyRequired: boolean;
  bodySchema?: OpenApiSchema;
  bodyContentType?: string;
  responseSchema?: OpenApiSchema;
}

export interface CrudGroup {
  name: string;
  operations: CrudOperation[];
}

export interface CrudModel {
  title: string;
  description?: string;
  groups: CrudGroup[];
  operations: CrudOperation[];
}

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);

function resolveReference<T>(document: OpenApiDocument, value: T): T {
  if (!value || typeof value !== "object" || !("$ref" in value)) return value;
  const reference = (value as { $ref?: unknown }).$ref;
  if (typeof reference !== "string" || !reference.startsWith("#/"))
    return value;
  let resolved: unknown = document;
  for (const encodedPart of reference.slice(2).split("/")) {
    const part = decodeURIComponent(encodedPart)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    if (!resolved || typeof resolved !== "object") return value;
    resolved = (resolved as Record<string, unknown>)[part];
  }
  return (resolved ?? value) as T;
}

function resolveSchema(
  document: OpenApiDocument,
  schema: OpenApiSchema | undefined,
): OpenApiSchema | undefined {
  return schema ? resolveReference(document, schema) : undefined;
}

function requestSchema(
  document: OpenApiDocument,
  operation: OpenApiOperation,
): { contentType?: string; schema?: OpenApiSchema } {
  const content = operation.requestBody?.content;
  if (!content) return {};
  const contentType = content["application/json"]
    ? "application/json"
    : Object.keys(content)[0];
  if (!contentType) return {};
  const schema = resolveSchema(document, content[contentType]?.schema);
  return {
    contentType,
    ...(schema ? { schema } : {}),
  };
}

function successfulResponseSchema(
  document: OpenApiDocument,
  operation: OpenApiOperation,
): OpenApiSchema | undefined {
  const responses = operation.responses ?? {};
  const success = Object.entries(responses).find(([status]) =>
    /^2\d\d$/.test(status),
  );
  const content = success?.[1].content;
  if (!content) return undefined;
  const media = content["application/json"] ?? Object.values(content)[0];
  return resolveSchema(document, media?.schema);
}

function fallbackOperationId(method: string, path: string): string {
  return `${method.toLowerCase()}${path
    .replace(/[{}]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")}`;
}

export function createCrudModel(document: OpenApiDocument): CrudModel {
  const operations: CrudOperation[] = [];

  for (const [path, pathItem] of Object.entries(document.paths)) {
    const sharedParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : [];
    for (const [method, candidate] of Object.entries(pathItem)) {
      if (
        !HTTP_METHODS.has(method.toLowerCase()) ||
        !candidate ||
        Array.isArray(candidate)
      ) {
        continue;
      }
      const operation = candidate as OpenApiOperation;
      const rawParameters = [
        ...sharedParameters,
        ...(operation.parameters ?? []),
      ];
      const parameters = rawParameters.map((raw) => {
        const parameter = resolveReference(document, raw) as OpenApiParameter;
        return {
          name: parameter.name,
          location: parameter.in as CrudParameter["location"],
          required: parameter.required === true || parameter.in === "path",
          ...(parameter.description
            ? { description: parameter.description }
            : {}),
          schema: resolveSchema(document, parameter.schema) ?? {
            type: "string",
          },
        };
      });
      const body = requestSchema(document, operation);
      const responseSchema = successfulResponseSchema(document, operation);
      const upperMethod = method.toUpperCase();
      const group =
        operation.tags?.[0] ?? path.split("/").filter(Boolean)[1] ?? "API";
      operations.push({
        id: operation.operationId ?? fallbackOperationId(method, path),
        method: upperMethod,
        path,
        summary: operation.summary ?? `${upperMethod} ${path}`,
        ...(operation.description
          ? { description: operation.description }
          : {}),
        group,
        destructive: upperMethod === "DELETE",
        parameters,
        bodyRequired: operation.requestBody?.required === true,
        ...(body.schema ? { bodySchema: body.schema } : {}),
        ...(body.contentType ? { bodyContentType: body.contentType } : {}),
        ...(responseSchema ? { responseSchema } : {}),
      });
    }
  }

  const grouped = new Map<string, CrudOperation[]>();
  for (const operation of operations) {
    const group = grouped.get(operation.group) ?? [];
    group.push(operation);
    grouped.set(operation.group, group);
  }
  return {
    title: document.info.title,
    ...(document.info.description
      ? { description: document.info.description }
      : {}),
    operations,
    groups: [...grouped].map(([name, groupedOperations]) => ({
      name,
      operations: groupedOperations,
    })),
  };
}

export interface LoadCrudModelOptions {
  openApiUrl?: string;
  fetchFn?: typeof fetch;
  headers?: HeadersInit;
}

export async function loadCrudModel(
  options: LoadCrudModelOptions = {},
): Promise<CrudModel> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(options.openApiUrl ?? "/openapi.json", {
    headers: { Accept: "application/json", ...options.headers },
  });
  if (!response.ok) {
    throw new Error(`Unable to load the API contract (${response.status})`);
  }
  return createCrudModel((await response.json()) as OpenApiDocument);
}

export interface CrudExecutionInput {
  parameters?: Record<string, unknown>;
  body?: unknown;
}

export interface CrudExecutionResult {
  ok: boolean;
  status: number;
  statusText: string;
  data: unknown;
  headers: Headers;
}

export interface CrudClientOptions {
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

export function createCrudClient(options: CrudClientOptions = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = (options.apiBaseUrl ?? "").replace(/\/$/, "");
  return {
    async execute(
      operation: CrudOperation,
      input: CrudExecutionInput = {},
    ): Promise<CrudExecutionResult> {
      let path = operation.path;
      const query = new URLSearchParams();
      const headerParameters = new Headers();
      for (const parameter of operation.parameters) {
        const value = input.parameters?.[parameter.name];
        if (value === undefined || value === null || value === "") {
          if (parameter.required)
            throw new Error(`${parameter.name} is required`);
          continue;
        }
        const serialized = String(value);
        if (parameter.location === "path") {
          path = path.replace(
            `{${parameter.name}}`,
            encodeURIComponent(serialized),
          );
        } else if (parameter.location === "query") {
          query.append(parameter.name, serialized);
        } else if (parameter.location === "header") {
          headerParameters.set(parameter.name, serialized);
        }
      }
      const queryString = query.toString();
      const suppliedHeaders =
        typeof options.headers === "function"
          ? await options.headers()
          : (options.headers ?? {});
      const headers = new Headers(suppliedHeaders);
      headers.set("Accept", "application/json");
      headerParameters.forEach((value, name) => headers.set(name, value));
      const hasBody = input.body !== undefined;
      if (hasBody)
        headers.set(
          "Content-Type",
          operation.bodyContentType ?? "application/json",
        );
      const response = await fetchFn(
        `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`,
        {
          method: operation.method,
          headers,
          ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
        },
      );
      const contentType = response.headers.get("content-type") ?? "";
      const data = contentType.includes("json")
        ? await response.json().catch(() => null)
        : await response.text();
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        headers: response.headers,
      };
    },
  };
}

export interface MountCrudUiOptions extends CrudClientOptions {
  openApiUrl?: string;
  openApiHeaders?: HeadersInit;
  title?: string;
  confirmDestructive?: (operation: CrudOperation) => boolean | Promise<boolean>;
}

function schemaType(schema: OpenApiSchema): string {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type) => type !== "null") ?? "string";
  }
  return typeof schema.type === "string" ? schema.type : "string";
}

function inputForSchema(
  name: string,
  schema: OpenApiSchema,
  required: boolean,
): HTMLElement {
  const label = document.createElement("label");
  label.className = "aeokit-crud__field";
  const caption = document.createElement("span");
  caption.textContent = schema.title ?? name;
  label.append(caption);
  let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (schema.enum) {
    input = document.createElement("select");
    if (!required) input.append(new Option("", ""));
    for (const value of schema.enum)
      input.append(new Option(String(value), String(value)));
  } else if (["object", "array"].includes(schemaType(schema))) {
    input = document.createElement("textarea");
    input.rows = 5;
    input.value =
      schema.default === undefined
        ? ""
        : JSON.stringify(schema.default, null, 2);
  } else {
    input = document.createElement("input");
    input.type =
      schemaType(schema) === "boolean"
        ? "checkbox"
        : schemaType(schema) === "number" || schemaType(schema) === "integer"
          ? "number"
          : "text";
    if (schema.format === "date") input.type = "date";
    if (schema.format === "date-time") input.type = "datetime-local";
    if (schema.default !== undefined) {
      if (input.type === "checkbox") input.checked = Boolean(schema.default);
      else input.value = String(schema.default);
    }
  }
  input.dataset.field = name;
  input.dataset.schemaType = schemaType(schema);
  input.required = required;
  if (schema.description) input.title = schema.description;
  label.append(input);
  return label;
}

function readField(
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): unknown {
  const type = input.dataset.schemaType;
  if (input instanceof HTMLInputElement && input.type === "checkbox")
    return input.checked;
  if (!input.value) return undefined;
  if (type === "number" || type === "integer") return Number(input.value);
  if (type === "object" || type === "array") return JSON.parse(input.value);
  return input.value;
}

export interface CrudTableModel {
  columns: string[];
  rows: Record<string, unknown>[];
}

export function createTableModel(data: unknown): CrudTableModel | null {
  const collection = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? Object.values(data).find(Array.isArray)
      : undefined;
  if (!collection) return null;
  const rows = collection.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(
    0,
    8,
  );
  return { columns, rows };
}

function humanize(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function operationLabel(operation: CrudOperation): string {
  const withoutMethod = operation.summary.replace(
    new RegExp(`^${operation.method}\\s+`, "i"),
    "",
  );
  return withoutMethod === operation.path
    ? humanize(operation.id)
    : withoutMethod;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderResult(container: HTMLElement, result: CrudExecutionResult) {
  container.replaceChildren();
  const tableModel = createTableModel(result.data);
  if (tableModel) {
    const meta = document.createElement("p");
    meta.className = "aeokit-crud__meta";
    meta.textContent = `${tableModel.rows.length} record${tableModel.rows.length === 1 ? "" : "s"}`;
    container.append(meta);
    if (!tableModel.rows.length) {
      const empty = document.createElement("div");
      empty.className = "aeokit-crud__empty";
      empty.textContent = "No records yet.";
      container.append(empty);
      return;
    }
    const scroller = document.createElement("div");
    scroller.className = "aeokit-crud__table-scroll";
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    for (const column of tableModel.columns) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = humanize(column);
      headingRow.append(cell);
    }
    head.append(headingRow);
    const body = document.createElement("tbody");
    for (const row of tableModel.rows) {
      const tableRow = document.createElement("tr");
      for (const column of tableModel.columns) {
        const cell = document.createElement("td");
        const value = displayValue(row[column]);
        cell.textContent = value;
        cell.title = value;
        tableRow.append(cell);
      }
      body.append(tableRow);
    }
    table.append(head, body);
    scroller.append(table);
    container.append(scroller);
    return;
  }
  const output = document.createElement("pre");
  output.textContent = `${result.status} ${result.statusText}\n${JSON.stringify(result.data, null, 2)}`;
  container.append(output);
}

function createOperationForm(
  operation: CrudOperation,
  client: ReturnType<typeof createCrudClient>,
  options: MountCrudUiOptions,
  afterMutation: () => void,
): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "aeokit-crud__action";
  if (operation.method === "POST" && !operation.parameters.length)
    details.open = true;
  const summary = document.createElement("summary");
  const method = document.createElement("span");
  method.className = `aeokit-crud__method aeokit-crud__method--${operation.method.toLowerCase()}`;
  method.textContent = operation.method;
  const label = document.createElement("span");
  label.textContent = operationLabel(operation);
  summary.append(method, label);
  details.append(summary);
  const form = document.createElement("form");
  form.dataset.operationId = operation.id;
  for (const parameter of operation.parameters) {
    form.append(
      inputForSchema(parameter.name, parameter.schema, parameter.required),
    );
  }
  if (operation.bodySchema?.properties) {
    const required = new Set(operation.bodySchema.required ?? []);
    for (const [name, schema] of Object.entries(
      operation.bodySchema.properties,
    )) {
      form.append(inputForSchema(name, schema, required.has(name)));
    }
  } else if (operation.bodySchema || operation.bodyContentType) {
    form.append(
      inputForSchema(
        "$body",
        { type: "object", title: "Request fields (JSON)" },
        operation.bodyRequired,
      ),
    );
  }
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = operation.destructive ? "Delete" : "Submit";
  submit.className = operation.destructive
    ? "aeokit-crud__button aeokit-crud__danger"
    : "aeokit-crud__button aeokit-crud__button--primary";
  const output = document.createElement("div");
  output.className = "aeokit-crud__result";
  output.setAttribute("aria-live", "polite");
  form.append(submit, output);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (
      operation.destructive &&
      !(await (options.confirmDestructive?.(operation) ??
        globalThis.confirm?.(`Run ${operationLabel(operation)}?`) ??
        false))
    )
      return;
    submit.disabled = true;
    output.textContent = "Working…";
    try {
      const values: Record<string, unknown> = {};
      for (const field of form.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("[data-field]"))
        values[field.dataset.field!] = readField(field);
      const body =
        values.$body ??
        (operation.bodySchema?.properties
          ? Object.fromEntries(
              Object.keys(operation.bodySchema.properties)
                .filter((name) => values[name] !== undefined)
                .map((name) => [name, values[name]]),
            )
          : undefined);
      const result = await client.execute(operation, {
        parameters: values,
        ...(body !== undefined ? { body } : {}),
      });
      renderResult(output, result);
      if (result.ok && operation.method !== "GET") afterMutation();
    } catch (error) {
      output.textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      submit.disabled = false;
    }
  });
  details.append(form);
  return details;
}

/** Mounts a framework-independent operation UI. The host owns auth, navigation and styling. */
export async function mountCrudUi(
  root: HTMLElement,
  options: MountCrudUiOptions = {},
): Promise<() => void> {
  const model = await loadCrudModel({
    ...(options.openApiUrl ? { openApiUrl: options.openApiUrl } : {}),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    ...(options.openApiHeaders ? { headers: options.openApiHeaders } : {}),
  });
  const client = createCrudClient(options);
  root.classList.add("aeokit-crud");
  root.replaceChildren();
  const shell = document.createElement("div");
  shell.className = "aeokit-crud__shell";
  const sidebar = document.createElement("aside");
  sidebar.className = "aeokit-crud__sidebar";
  const brand = document.createElement("div");
  brand.className = "aeokit-crud__brand";
  brand.textContent = options.title ?? "Data manager";
  const navigation = document.createElement("nav");
  navigation.setAttribute("aria-label", "Resources");
  sidebar.append(brand, navigation);
  const content = document.createElement("main");
  content.className = "aeokit-crud__content";
  shell.append(sidebar, content);
  root.append(shell);

  const preferred =
    model.groups.find((group) => group.name.toLowerCase() === "projects") ??
    model.groups.find((group) =>
      group.operations.some((operation) => operation.method === "POST"),
    ) ??
    model.groups[0];
  let activeGroup = preferred;
  let disposed = false;

  const renderGroup = (group: CrudGroup) => {
    activeGroup = group;
    for (const button of navigation.querySelectorAll("button")) {
      button.classList.toggle("is-active", button.dataset.group === group.name);
    }
    content.replaceChildren();
    const header = document.createElement("header");
    header.className = "aeokit-crud__header";
    const titles = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.textContent = "Resource";
    const heading = document.createElement("h1");
    heading.textContent = humanize(group.name);
    titles.append(eyebrow, heading);
    header.append(titles);
    content.append(header);

    const collectionOperation = [...group.operations]
      .filter(
        (operation) =>
          operation.method === "GET" &&
          !operation.parameters.some(
            (parameter) => parameter.location === "path" && parameter.required,
          ),
      )
      .sort((left, right) => left.path.length - right.path.length)[0];
    const collectionResult = document.createElement("section");
    collectionResult.className = "aeokit-crud__card";
    const collectionHeader = document.createElement("div");
    collectionHeader.className = "aeokit-crud__card-header";
    const collectionTitle = document.createElement("h2");
    collectionTitle.textContent = "Records";
    const refresh = document.createElement("button");
    refresh.className = "aeokit-crud__button";
    refresh.type = "button";
    refresh.textContent = "Refresh";
    collectionHeader.append(collectionTitle, refresh);
    const records = document.createElement("div");
    records.className = "aeokit-crud__result";
    collectionResult.append(collectionHeader, records);
    if (collectionOperation) content.append(collectionResult);

    const loadCollection = async () => {
      if (!collectionOperation) return;
      refresh.disabled = true;
      records.textContent = "Loading records…";
      try {
        const result = await client.execute(collectionOperation);
        if (!disposed && activeGroup === group) renderResult(records, result);
      } catch (error) {
        records.textContent =
          error instanceof Error ? error.message : String(error);
      } finally {
        refresh.disabled = false;
      }
    };
    refresh.addEventListener("click", loadCollection);

    const actions = group.operations.filter(
      (operation) => operation !== collectionOperation,
    );
    if (actions.length) {
      const actionSection = document.createElement("section");
      actionSection.className = "aeokit-crud__actions";
      const actionHeading = document.createElement("h2");
      actionHeading.textContent = "Forms & actions";
      actionSection.append(actionHeading);
      for (const operation of actions) {
        actionSection.append(
          createOperationForm(operation, client, options, loadCollection),
        );
      }
      content.append(actionSection);
    }
    void loadCollection();
  };

  for (const group of model.groups) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.group = group.name;
    button.textContent = humanize(group.name);
    button.addEventListener("click", () => renderGroup(group));
    navigation.append(button);
  }
  if (preferred) renderGroup(preferred);
  return () => {
    disposed = true;
    root.replaceChildren();
  };
}
