import { afterEach, describe, expect, it, vi } from "vitest";
import { runOpenRouterChat } from "./openrouter.js";

afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter UI tools", () => {
  it("lets chat create tracked prompts when the user asks it to do the work", async () => {
    const createPrompts = vi.fn().mockResolvedValue({
      created: ["What is Picks.so and who is it for?"],
      skipped: [],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: "create-one",
                      type: "function",
                      function: {
                        name: "create_tracked_prompts",
                        arguments: JSON.stringify({
                          prompts: ["What is Picks.so and who is it for?"],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Created 1 tracked prompt." } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runOpenRouterChat({
      environment: { OPENROUTER_API_KEY: "test" },
      webSearch: false,
      messages: [{ role: "user", content: "u do it" }],
      uiContext: { route: "/ai-chat", page: "AI Chat", insights: [] },
      createPrompts,
    });

    expect(createPrompts).toHaveBeenCalledWith([
      "What is Picks.so and who is it for?",
    ]);
    expect(result.answer).toBe("Created 1 tracked prompt.");
    expect(result.uiActions).toContainEqual({
      type: "open_app_page",
      page: "prompts",
      label: "Prompts",
      executeImmediately: true,
    });
    const firstBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(firstBody.tools).toContainEqual(
      expect.objectContaining({
        function: expect.objectContaining({ name: "create_tracked_prompts" }),
      }),
    );
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    );
    expect(secondBody.messages).toContainEqual({
      role: "tool",
      tool_call_id: "create-one",
      content: JSON.stringify({
        created: ["What is Picks.so and who is it for?"],
        skipped: [],
      }),
    });
  });

  it("offers app navigation even when the current page has no tagged insights", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Opening citations" } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await runOpenRouterChat({
      environment: { OPENROUTER_API_KEY: "test" },
      webSearch: false,
      messages: [{ role: "user", content: "Show me citations" }],
      uiContext: { route: "/prompts", page: "Prompts", insights: [] },
    });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body.tools).toContainEqual(
      expect.objectContaining({
        function: expect.objectContaining({ name: "open_app_page" }),
      }),
    );
  });

  it("uses a local OpenAI-compatible endpoint without OpenRouter online routing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "mlx-community/Qwen3.6-35B-A3B-4bit",
          choices: [{ message: { content: "Hello from MLX" } }],
          usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runOpenRouterChat({
      environment: {
        AI_CHAT_BASE_URL: "http://host.docker.internal:8081/v1/",
        AI_CHAT_API_KEY: "local",
        AI_CHAT_MODEL: "mlx-community/Qwen3.6-35B-A3B-4bit",
        AI_CHAT_WEB_SEARCH: "false",
      },
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://host.docker.internal:8081/v1/chat/completions",
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer local" }),
    );
    expect(JSON.parse(String(request.body)).model).toBe(
      "mlx-community/Qwen3.6-35B-A3B-4bit",
    );
    expect(result.answer).toBe("Hello from MLX");
  });

  it("executes model-selected read-only tools and returns only allowlisted actions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: "one",
                      type: "function",
                      function: { name: "list_ui_insights", arguments: "{}" },
                    },
                    {
                      id: "two",
                      type: "function",
                      function: {
                        name: "show_ui_insight",
                        arguments: JSON.stringify({
                          insightId: "mention-rate",
                        }),
                      },
                    },
                    {
                      id: "three",
                      type: "function",
                      function: {
                        name: "show_ui_insight",
                        arguments: JSON.stringify({ insightId: "secret" }),
                      },
                    },
                    {
                      id: "four",
                      type: "function",
                      function: {
                        name: "open_app_page",
                        arguments: JSON.stringify({
                          page: "prompts",
                          executeImmediately: true,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "test/model",
            choices: [
              { message: { content: "The visible mention rate is 24%." } },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await runOpenRouterChat({
      environment: { OPENROUTER_API_KEY: "test" },
      webSearch: false,
      messages: [{ role: "user", content: "Explain this" }],
      uiContext: {
        route: "/app",
        page: "Dashboard",
        insights: [
          {
            id: "mention-rate",
            label: "Mention rate",
            text: "Mention rate 24%",
          },
        ],
      },
    });
    expect(result.answer).toBe("The visible mention rate is 24%.");
    expect(result.uiActions).toEqual([
      {
        type: "show_ui_insight",
        insightId: "mention-rate",
        label: "Mention rate",
      },
      {
        type: "open_app_page",
        page: "prompts",
        label: "Prompts",
        executeImmediately: true,
      },
    ]);
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    );
    expect(secondBody.messages).toContainEqual(
      expect.objectContaining({
        role: "tool",
        content: expect.stringContaining("mention-rate"),
      }),
    );
    const firstBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(firstBody.tools[0].function.description).toContain(
      "Call this before answering questions about what is visible",
    );
    expect(firstBody.tools[1].function.description).toContain(
      "user-controlled button",
    );
    expect(firstBody.tools[2].function.name).toBe("open_app_page");
    expect(
      firstBody.tools[2].function.parameters.properties.page.enum,
    ).toContain("prompts");
  });
});
