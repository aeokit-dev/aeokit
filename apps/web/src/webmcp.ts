export interface UiInsight {
  id: string;
  label: string;
  page: string;
  text: string;
  value?: string;
}

export interface UiContext {
  route: string;
  page: string;
  projectId?: string;
  organizationId?: string;
  visibleState?: Record<string, string>;
  insights: UiInsight[];
}

interface ModelContextLike {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint: boolean };
      execute: (input: Record<string, unknown>) => unknown;
    },
    options: { signal: AbortSignal },
  ) => Promise<void>;
}

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
}

function visible(element: HTMLElement): boolean {
  return !element.hidden && element.getAttribute("aria-hidden") !== "true";
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1_200);
}

export function collectUiInsights(root: ParentNode = document): UiInsight[] {
  const page =
    root.querySelector<HTMLElement>("[data-webmcp-page]")?.dataset.webmcpPage ??
    (compactText(root.querySelector("h1")?.textContent ?? "") ||
      document.title);

  return Array.from(root.querySelectorAll<HTMLElement>("[data-webmcp-insight]"))
    .filter(visible)
    .map((element) => ({
      id: element.dataset.webmcpInsight ?? "",
      label:
        element.getAttribute("aria-label") ??
        compactText(
          element.querySelector("h1,h2,h3")?.textContent ?? "Insight",
        ),
      page,
      text: compactText(element.innerText || element.textContent || ""),
      ...(element.dataset.webmcpValue
        ? { value: compactText(element.dataset.webmcpValue) }
        : {}),
    }))
    .filter((insight) => insight.id && insight.text);
}

export function collectUiContext(
  root: ParentNode = document,
  identity: {
    route?: string;
    projectId?: string;
    organizationId?: string;
  } = {},
): UiContext {
  const insights = collectUiInsights(root);
  const page =
    insights[0]?.page ??
    root.querySelector<HTMLElement>("[data-webmcp-page]")?.dataset.webmcpPage ??
    "Current page";
  const visibleState = Object.fromEntries(
    Array.from(root.querySelectorAll<HTMLElement>("[data-webmcp-state]"))
      .filter(visible)
      .slice(0, 30)
      .flatMap((element) => {
        const key = element.dataset.webmcpState;
        const value =
          element.dataset.webmcpValue ?? compactText(element.textContent ?? "");
        return key && value ? [[key, value]] : [];
      }),
  );
  return {
    route: (
      identity.route ??
      (typeof location === "undefined"
        ? ""
        : `${location.pathname}${location.search}`)
    ).slice(0, 500),
    page,
    ...(identity.projectId ? { projectId: identity.projectId } : {}),
    ...(identity.organizationId
      ? { organizationId: identity.organizationId }
      : {}),
    ...(Object.keys(visibleState).length ? { visibleState } : {}),
    insights: insights.slice(0, 40),
  };
}

export function showUiInsight(id: string): string {
  const escaped =
    typeof CSS === "undefined" ? id.replace(/["\\]/g, "\\$&") : CSS.escape(id);
  const element = document.querySelector<HTMLElement>(
    `[data-webmcp-insight="${escaped}"]`,
  );
  if (!element || !visible(element)) return `No visible insight named "${id}".`;

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.remove("webmcp-highlight");
  // Restart the animation when an agent reveals the same evidence twice.
  void element.offsetWidth;
  element.classList.add("webmcp-highlight");
  globalThis.setTimeout(
    () => element.classList.remove("webmcp-highlight"),
    3_000,
  );
  return `Showing "${element.getAttribute("aria-label") ?? id}" in the aeokit UI.`;
}

export function registerAeokitWebMcpTools(
  modelContext: ModelContextLike | undefined = document.modelContext,
  projectId?: string,
): () => void {
  const controller = new AbortController();
  if (!modelContext) return () => controller.abort();

  const options = { signal: controller.signal };
  const register = (tool: Parameters<ModelContextLike["registerTool"]>[0]) => {
    void modelContext.registerTool(tool, options).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.warn("Could not register aeokit WebMCP tool", error);
      }
    });
  };
  register({
    name: "list_aeokit_ui_insights",
    description:
      "List the evidence and insight regions visible in the current aeokit view. Use this to ground an answer in what the user can see, then use show_aeokit_ui_insight to point it out.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: () => ({
      pageUrl: window.location.href,
      insights: collectUiInsights(),
    }),
  });
  register({
    name: "show_aeokit_ui_insight",
    description:
      "Scroll to and briefly highlight an aeokit insight so the user can see where a claim or answer came from. Call list_aeokit_ui_insights first and pass one of its exact ids.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Exact insight id returned by list_aeokit_ui_insights",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: ({ id }) => showUiInsight(String(id ?? "")),
  });
  if (projectId)
    register({
      name: "create_aeokit_tracked_prompts",
      description:
        "Create concrete tracked prompts in the active aeokit project after the user explicitly asks to add, save, create, or track them. Do not use this for brainstorming-only requests or placeholder templates.",
      inputSchema: {
        type: "object",
        properties: {
          prompts: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { type: "string", minLength: 5, maxLength: 2_000 },
          },
        },
        required: ["prompts"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async ({ prompts }) => {
        const values = Array.isArray(prompts)
          ? prompts
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter((value) => value.length >= 5 && value.length <= 2_000)
              .slice(0, 20)
          : [];
        const created: string[] = [];
        const failed: Array<{ value: string; error: string }> = [];
        for (const value of values) {
          try {
            await api(`/projects/${projectId}/prompts`, {
              method: "POST",
              body: JSON.stringify({
                value,
                tags: ["webmcp"],
                enabled: true,
                cadenceMinutes: 360,
                targets: [
                  {
                    provider: "brightdata",
                    model: "chatgpt",
                    webSearch: true,
                  },
                ],
              }),
            });
            created.push(value);
          } catch (error) {
            failed.push({
              value,
              error: error instanceof Error ? error.message : "Creation failed",
            });
          }
        }
        return { created, failed };
      },
    });

  return () => controller.abort();
}
import { api } from "./api";
