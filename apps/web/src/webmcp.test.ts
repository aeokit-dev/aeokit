import { describe, expect, it, vi } from "vitest";
import {
  collectUiContext,
  collectUiInsights,
  registerAeokitWebMcpTools,
  showUiInsight,
} from "./webmcp";

describe("aeokit WebMCP UI context", () => {
  it("serializes route, page, visible state, and structured insight evidence", () => {
    const insight = {
      hidden: false,
      dataset: { webmcpInsight: "mention-rate", webmcpValue: "24%" },
      getAttribute: (name: string) =>
        name === "aria-label" ? "Mention rate" : null,
      querySelector: () => null,
      innerText: "Mention rate 24%",
      textContent: "Mention rate 24%",
    };
    const root = {
      querySelector: (selector: string) =>
        selector === "[data-webmcp-page]"
          ? { dataset: { webmcpPage: "Dashboard" } }
          : null,
      querySelectorAll: (selector: string) =>
        selector === "[data-webmcp-insight]"
          ? [insight]
          : [
              {
                dataset: { webmcpState: "period", webmcpValue: "30d" },
                getAttribute: () => null,
                textContent: "30 days",
              },
            ],
    } as unknown as ParentNode;
    expect(
      collectUiContext(root, { route: "/app/dashboard", projectId: "p1" }),
    ).toEqual(
      expect.objectContaining({
        route: "/app/dashboard",
        page: "Dashboard",
        projectId: "p1",
        visibleState: { period: "30d" },
        insights: [
          expect.objectContaining({ id: "mention-rate", value: "24%" }),
        ],
      }),
    );
  });
  it("describes visible, labelled insight regions", () => {
    const insight = {
      hidden: false,
      dataset: { webmcpInsight: "mention-rate" },
      getAttribute: (name: string) =>
        name === "aria-label" ? "Mention rate" : null,
      querySelector: () => null,
      innerText: "Mention rate 42% across 12 successful runs",
      textContent: "Mention rate 42% across 12 successful runs",
    };
    const root = {
      querySelector: () => ({ dataset: { webmcpPage: "Visibility" } }),
      querySelectorAll: () => [insight],
    } as unknown as ParentNode;

    expect(collectUiInsights(root)).toEqual([
      {
        id: "mention-rate",
        label: "Mention rate",
        page: "Visibility",
        text: "Mention rate 42% across 12 successful runs",
      },
    ]);
  });

  it("registers discovery, reveal, and project-scoped prompt creation tools", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    const abort = registerAeokitWebMcpTools({ registerTool }, "project-1");

    await vi.waitFor(() => expect(registerTool).toHaveBeenCalledTimes(3));
    expect(registerTool.mock.calls.map(([tool]) => tool.name)).toEqual([
      "list_aeokit_ui_insights",
      "show_aeokit_ui_insight",
      "create_aeokit_tracked_prompts",
    ]);
    expect(registerTool.mock.calls[0]?.[0].annotations).toEqual({
      readOnlyHint: true,
    });
    expect(registerTool.mock.calls[2]?.[0].annotations).toEqual({
      readOnlyHint: false,
    });

    abort();
    expect(registerTool.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });

  it("reports an action unavailable after navigation removes its insight", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    expect(showUiInsight("old-route-metric")).toContain("No visible insight");
    vi.unstubAllGlobals();
  });
});
