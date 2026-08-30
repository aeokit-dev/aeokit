import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataForSeoProvider, dataForSeoPromptLimit } from "./dataforseo";

const credentials = {
  DATAFORSEO_API_KEY: Buffer.from("api-login:api-password").toString("base64"),
  DATAFORSEO_RETRY_DELAY_MS: "0",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("DataForSEO provider", () => {
  it("requires a Base64 API credential", () => {
    expect(createDataForSeoProvider({}).configured).toBe(false);
    expect(
      createDataForSeoProvider({
        DATAFORSEO_API_KEY: Buffer.from("login:password").toString("base64"),
      }).configured,
    ).toBe(true);
  });

  it("uses the scraper prompt limit for ChatGPT and Gemini", () => {
    expect(dataForSeoPromptLimit("chatgpt")).toBe(2_000);
    expect(dataForSeoPromptLimit("gemini")).toBe(2_000);
    expect(dataForSeoPromptLimit("claude")).toBe(500);
    expect(dataForSeoPromptLimit("perplexity")).toBe(500);
  });

  it("rejects a value that is not Base64 login:password", async () => {
    await expect(
      createDataForSeoProvider({ DATAFORSEO_API_KEY: "raw-key" }).run(
        "best Mac apps",
      ),
    ).rejects.toThrow(/Base64-encoded/);
  });

  it("extracts the AI Overview and its citations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        status_code: 20000,
        cost: 0.004,
        tasks: [
          {
            status_code: 20000,
            status_message: "Ok.",
            result: [
              {
                items: [
                  { type: "organic", title: "Regular result" },
                  {
                    type: "ai_overview",
                    markdown: "Mac app bundles can reduce software costs.",
                    references: [
                      {
                        url: "https://example.com/mac-app-deals",
                        title: "Mac app deals",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result =
      await createDataForSeoProvider(credentials).run("best Mac app deals");

    expect(result.answer).toContain("reduce software costs");
    expect(result.citations).toEqual([
      {
        url: "https://example.com/mac-app-deals",
        domain: "example.com",
        title: "Mac app deals",
        position: 0,
      },
    ]);
    expect(result.webQueries).toEqual(["Unavailable from provider"]);
    expect(result.costUsd).toBe(0.004);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${credentials.DATAFORSEO_API_KEY}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual([
      expect.objectContaining({
        keyword: "best Mac app deals",
        location_code: 2840,
        language_code: "en",
        device: "desktop",
        depth: 10,
        load_async_ai_overview: true,
      }),
    ]);
  });

  it("records a successful absence when Google has no AI Overview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              status_message: "Ok.",
              result: [{ items: [{ type: "organic" }] }],
            },
          ],
        }),
      ),
    );

    const result = await createDataForSeoProvider(credentials).run(
      "a query with no overview",
    );
    expect(result.answer).toBe(
      "No Google AI Overview was returned for this query.",
    );
    expect(result.citations).toEqual([]);
  });

  it("extracts Google AI Mode answers and nested citations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                items: [
                  {
                    type: "ai_overview",
                    markdown: "AI Mode compares several products.",
                    items: [
                      {
                        type: "ai_overview_element",
                        references: [
                          {
                            url: "https://example.com/comparison",
                            source: "Example",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDataForSeoProvider(credentials).run(
      "compare products",
      { model: "google-ai-mode" },
    );

    expect(result.model).toBe("google-ai-mode");
    expect(result.answer).toContain("compares several products");
    expect(result.citations[0]).toEqual({
      url: "https://example.com/comparison",
      domain: "example.com",
      title: "Example",
      position: 0,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/serp/google/ai_mode/live/advanced",
    );
  });

  it.each([
    ["chatgpt", "chat_gpt", ["brand comparison"]],
    ["gemini", "gemini", []],
  ])(
    "extracts %s LLM Scraper results and cited sources",
    async (target, endpointEngine, expectedWebQueries) => {
      const fetchMock = vi.fn().mockResolvedValue(
        response({
          status_code: 20000,
          cost: 0.004,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  model: target === "chatgpt" ? "gpt-4o" : "Fast",
                  markdown: "The user-facing answer recommends the brand.",
                  sources: [
                    {
                      url: "https://example.com/cited-source",
                      title: "Cited source",
                    },
                  ],
                  ...(target === "chatgpt"
                    ? { fan_out_queries: ["brand comparison"] }
                    : {}),
                  items: [
                    {
                      type: `${endpointEngine}_text`,
                      markdown: "A structured answer element.",
                      sources: [
                        {
                          url: "https://example.com/cited-source",
                          title: "Cited source",
                        },
                        {
                          url: "https://source.test/nested",
                          source_name: "Nested source",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await createDataForSeoProvider(credentials).run(
        "which brand is best?",
        { model: target },
      );

      expect(result.answer).toBe(
        "The user-facing answer recommends the brand.",
      );
      expect(result.model).toBe(target);
      expect(result.citations).toEqual([
        {
          url: "https://example.com/cited-source",
          domain: "example.com",
          title: "Cited source",
          position: 0,
        },
        {
          url: "https://source.test/nested",
          domain: "source.test",
          title: "Nested source",
          position: 1,
        },
      ]);
      expect(result.webQueries).toEqual(expectedWebQueries);
      expect(result.costUsd).toBe(0.004);
      expect(fetchMock.mock.calls[0]?.[0]).toContain(
        `/ai_optimization/${endpointEngine}/llm_scraper/live/advanced`,
      );
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const [body] = JSON.parse(String(init.body));
      expect(body).toEqual(
        expect.objectContaining({
          keyword: "which brand is best?",
          location_code: 2840,
          language_code: "en",
        }),
      );
      expect(body.user_prompt).toBeUndefined();
      expect(body.model_name).toBeUndefined();
      if (target === "chatgpt") {
        expect(body.force_web_search).toBe(true);
      } else {
        expect(body.force_web_search).toBeUndefined();
      }
    },
  );

  it.each([
    ["claude", "claude", "claude-sonnet-4-0", "claude-sonnet-4-20250514"],
    ["perplexity", "perplexity", "sonar", "sonar"],
  ])(
    "extracts %s LLM responses and citations",
    async (target, endpointEngine, requestedModel, returnedModel) => {
      const fetchMock = vi.fn().mockResolvedValue(
        response({
          status_code: 20000,
          cost: 0.02,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  model_name: returnedModel,
                  items: [
                    {
                      type: "reasoning",
                      sections: [{ type: "summary_text", text: "Hidden" }],
                    },
                    {
                      type: "message",
                      sections: [{ type: "text", text: "Searching..." }],
                    },
                    {
                      type: "message",
                      sections: [
                        {
                          type: "text",
                          text: "The tracked brand is recommended.",
                          annotations: [
                            {
                              url: "https://example.com/source",
                              title: "Source",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await createDataForSeoProvider(credentials).run(
        "which brand is best?",
        { model: target },
      );

      expect(result.answer).toBe("The tracked brand is recommended.");
      expect(result.model).toBe(returnedModel);
      expect(result.citations).toHaveLength(1);
      expect(result.costUsd).toBe(0.02);
      expect(fetchMock.mock.calls[0]?.[0]).toContain(
        `/ai_optimization/${endpointEngine}/llm_responses/live`,
      );
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const [body] = JSON.parse(String(init.body));
      expect(body).toEqual(
        expect.objectContaining({
          user_prompt: "which brand is best?",
          model_name: requestedModel,
          max_output_tokens: 4096,
        }),
      );
      expect(body.web_search_country_iso_code).toBe("US");
      if (target === "perplexity") {
        expect(body.web_search).toBeUndefined();
      } else {
        expect(body.web_search).toBe(true);
      }
    },
  );

  it("retries a transient internal search-engine error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          status_code: 20000,
          tasks: [
            {
              status_code: 40602,
              status_message: "Internal SE Server Error.",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              status_message: "Ok.",
              result: [{ items: [] }],
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createDataForSeoProvider(credentials).run("best Mac apps");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported surfaces before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createDataForSeoProvider(credentials).run("best Mac apps", {
        model: "bing-copilot",
      }),
    ).rejects.toThrow(/unsupported/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
