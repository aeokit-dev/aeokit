import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brightDataDefaultMaxWaitMs,
  brightDataDatasetIds,
  brightDataPollDelay,
  brightDataPromptLimit,
  createBrightDataProvider,
} from "./brightdata.js";

const credentials = {
  BRIGHTDATA_API_KEY: "bright-data-api-key",
  BRIGHTDATA_SERP_ZONE: "openaeo_serp",
  BRIGHTDATA_POLL_INTERVAL_MS: "1",
  BRIGHTDATA_MAX_WAIT_MS: "1000",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Bright Data provider", () => {
  it("requires the API key and SERP zone for full surface coverage", () => {
    expect(createBrightDataProvider({}).configured).toBe(false);
    expect(
      createBrightDataProvider({ BRIGHTDATA_API_KEY: "key" }).configured,
    ).toBe(false);
    expect(createBrightDataProvider(credentials).configured).toBe(true);
  });

  it("supports the UI prompt limit", () => {
    expect(brightDataPromptLimit("chatgpt")).toBe(2_000);
    expect(brightDataPromptLimit("bing-copilot")).toBe(2_000);
  });

  it.each([
    [
      "chatgpt",
      brightDataDatasetIds.chatgpt,
      "https://chatgpt.com/",
      "citations",
    ],
    [
      "perplexity",
      brightDataDatasetIds.perplexity,
      "https://www.perplexity.ai/",
      "sources",
    ],
    [
      "gemini",
      brightDataDatasetIds.gemini,
      "https://gemini.google.com/",
      "sources",
    ],
    [
      "bing-copilot",
      brightDataDatasetIds.bingCopilot,
      "https://copilot.microsoft.com/",
      "sources",
    ],
    [
      "google-ai-mode",
      brightDataDatasetIds.googleAiMode,
      "https://www.google.com/search",
      "citations",
    ],
  ])(
    "collects the %s user-facing scraper result",
    async (target, datasetId, surfaceUrl, sourceField) => {
      const fetchMock = vi.fn().mockResolvedValue(
        response([
          {
            answer_text_markdown: "The visible answer recommends aeokit.",
            answer_html: "<div>This unused HTML should not be archived.</div>",
            [sourceField]: [
              { url: "https://example.com/source", title: "Source" },
            ],
          },
        ]),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await createBrightDataProvider(credentials).run(
        "best AEO tools",
        { model: target },
      );

      expect(result.provider).toBe("brightdata");
      expect(result.model).toBe(target);
      expect(result.answer).toContain("recommends aeokit");
      expect(result.citations).toEqual([
        {
          url: "https://example.com/source",
          domain: "example.com",
          title: "Source",
          position: 0,
        },
      ]);
      expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
        `dataset_id=${datasetId}`,
      );
      const requestUrl = new URL(fetchMock.mock.calls[0]?.[0].toString());
      const outputFields = requestUrl.searchParams
        .get("custom_output_fields")
        ?.split("|");
      if (target === "chatgpt") {
        expect(outputFields).toContain("answer_text_markdown");
        expect(outputFields).toContain("citations");
        expect(outputFields).not.toContain("answer_html");
      } else {
        expect(outputFields).toBeUndefined();
      }
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${credentials.BRIGHTDATA_API_KEY}`,
      );
      const [input] = JSON.parse(String(init.body));
      expect(input.prompt).toBe("best AEO tools");
      expect(input.url).toContain(surfaceUrl);
      if (target === "chatgpt") {
        expect(input.web_search).toBe(true);
        expect(input.country).toBeUndefined();
      } else {
        expect(input.web_search).toBeUndefined();
      }
      // The archive keeps the allowlisted values only; a discarded field is
      // recorded by name so the payload's shape stays diagnosable.
      expect(JSON.stringify(result.raw)).not.toContain(
        "This unused HTML should not be archived",
      );
      expect(
        (result.raw as Array<{ _droppedFields?: string[] }>)[0]?._droppedFields,
      ).toEqual(["answer_html"]);
    },
  );

  it("polls and downloads a scraper snapshot after sync auto-conversion", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ snapshot_id: "s_snapshot" }, 202))
      .mockResolvedValueOnce(
        response({ snapshot_id: "s_snapshot", status: "ready" }),
      )
      .mockResolvedValueOnce(
        response([
          {
            answer_text: "The delayed answer.",
            sources: [],
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createBrightDataProvider(credentials).run("a prompt", {
      model: "gemini",
    });

    expect(result.answer).toBe("The delayed answer.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      "/datasets/v3/progress/s_snapshot",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toContain(
      "/datasets/v3/snapshot/s_snapshot?format=json",
    );
  });

  it("allows observed 156-second jobs and backs polling off adaptively", () => {
    expect(brightDataDefaultMaxWaitMs).toBeGreaterThan(156_000);
    expect(brightDataPollDelay(0, 2_000)).toBe(2_000);
    expect(brightDataPollDelay(45_000, 2_000)).toBeGreaterThan(2_000);
    expect(brightDataPollDelay(150_000, 2_000)).toBeLessThanOrEqual(10_000);
  });

  it("resumes an existing snapshot instead of submitting a duplicate paid scrape", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ snapshot_id: "s_existing", status: "ready" }),
      )
      .mockResolvedValueOnce(
        response([{ answer_text: "Recovered answer", sources: [] }]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createBrightDataProvider(credentials).run("a prompt", {
      model: "gemini",
      resumeToken: "s_existing",
    });

    expect(result.answer).toBe("Recovered answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/datasets/v3/progress/s_existing",
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/datasets/v3/scrape"),
      ),
    ).toBe(false);
  });

  it("clears a terminally failed snapshot so the next retry can resubmit", async () => {
    const onResumeToken = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          snapshot_id: "s_failed",
          status: "failed",
          message: "upstream scraper failed",
        }),
      ),
    );

    await expect(
      createBrightDataProvider(credentials).run("a prompt", {
        model: "gemini",
        resumeToken: "s_failed",
        onResumeToken,
      }),
    ).rejects.toThrow("upstream scraper failed");
    expect(onResumeToken).toHaveBeenCalledWith(null);
  });

  it("extracts Google AI Overview text and citations from SERP JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        status_code: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ai_overview: {
            texts: [
              { snippet: "aeokit tracks AI visibility." },
              {
                title: "Key capabilities",
                list: [{ snippet: "It records citations." }],
              },
            ],
            references: [
              {
                href: "https://example.com/overview-source",
                title: "Overview source",
              },
            ],
          },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createBrightDataProvider(credentials).run(
      "what is aeokit?",
      { model: "google-ai-overview" },
    );

    expect(result.answer).toBe(
      "aeokit tracks AI visibility.\n\nKey capabilities\n\nIt records citations.",
    );
    expect(result.citations[0]).toEqual({
      url: "https://example.com/overview-source",
      domain: "example.com",
      title: "Overview source",
      position: 0,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.brightdata.com/request",
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.zone).toBe("openaeo_serp");
    expect(body.format).toBe("json");
    expect(body.url).toContain("brd_ai_overview=2");
    expect(body.url).toContain("brd_json=json");
  });

  it("resolves the observed production Google goto citation before classification", async () => {
    const opaqueGoogleUrl =
      "https://www.google.com/goto?url=CAESPgHrOzAV9wEC95_NZ6oHzSB6a0fc91tEn_LF_chc6KZpnSm-DxPL1FKiNO9DhnYXPpe2UK2EbnedTZ-0M5Pf";
    const productionBody = {
      general: {
        search_engine: "google",
        query: "MacSpotter vs Apple Inventory Checker",
        detected_query: "MacSpotter vs Apple Inventory Checker",
        results_cnt: 2_970_000,
        search_time: 0.42,
      },
      ai_overview: {
        global_rank: 1,
        rank: 1,
        texts: [{ snippet: "MacSpotter checks nearby Apple inventory." }],
        references: [
          {
            href: opaqueGoogleUrl,
            title:
              "MacSpotter: Mac Stock Checker – Apple Store Pickup Near You. Opens in new tab.",
          },
        ],
      },
      organic: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          status_code: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(productionBody),
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://www.macspotter.com/" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createBrightDataProvider(credentials).run(
      "MacSpotter vs Apple Inventory Checker",
      { model: "google-ai-overview" },
    );

    expect(result.citations).toEqual([
      {
        url: "https://www.macspotter.com/",
        domain: "macspotter.com",
        title:
          "MacSpotter: Mac Stock Checker – Apple Store Pickup Near You. Opens in new tab.",
        position: 0,
      },
    ]);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(opaqueGoogleUrl);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
  });

  it("rejects unsupported surfaces before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createBrightDataProvider(credentials).run("best AEO tools", {
        model: "claude",
      }),
    ).rejects.toThrow(/unsupported/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
