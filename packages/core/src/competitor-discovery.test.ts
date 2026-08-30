import { describe, expect, it } from "vitest";
import {
  discoverCompetitors,
  hasMateriallyNewEvidence,
} from "./competitor-discovery";

const runs = [
  {
    id: "run-1",
    promptId: "prompt-1",
    prompt: "What are the best AI visibility tools?",
    provider: "openai",
    model: "gpt-5",
    answer:
      "The leading options are **Profound**, Scrunch AI, and the tracked brand AeoKit.",
    completedAt: "2026-08-20T00:00:00.000Z",
  },
  {
    id: "run-2",
    promptId: "prompt-2",
    prompt: "Which platforms measure answer-engine visibility?",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    answer: "Consider Profound or Scrunch for enterprise reporting.",
    completedAt: "2026-08-21T00:00:00.000Z",
  },
  {
    id: "run-3",
    promptId: "prompt-3",
    prompt: "Compare AEO software.",
    provider: "openai",
    model: "gpt-5",
    answer:
      "Profound Inc. provides analytics. Forbes also covers this category.",
    completedAt: "2026-08-22T00:00:00.000Z",
  },
];

describe("competitor discovery", () => {
  it("discovers repeated brands with evidence while excluding the project and publishers", () => {
    const result = discoverCompetitors({
      runs,
      brand: { name: "AeoKit", aliases: ["OpenAEO"] },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.answersAnalyzed).toBe(3);
    expect(result.suggestions.map((item) => item.name)).toEqual([
      "Profound",
      "Scrunch",
    ]);
    expect(result.suggestions[0]).toMatchObject({
      mentionCount: 3,
      mentionPercentage: 100,
      promptCount: 3,
      providerCount: 2,
      confidence: "high",
    });
    expect(result.suggestions[0]?.evidence).toHaveLength(3);
    expect(result.suggestions.some((item) => item.name === "AeoKit")).toBe(
      false,
    );
    expect(result.suggestions.some((item) => item.name === "Forbes")).toBe(
      false,
    );
  });

  it("normalizes corporate suffixes and deduplicates tracked competitors", () => {
    const result = discoverCompetitors({
      runs,
      brand: { name: "AeoKit" },
      existingCompetitors: [{ name: "Profound", aliases: ["Profound Inc."] }],
      minimumMentions: 1,
    });

    expect(result.suggestions.map((item) => item.name)).not.toContain(
      "Profound",
    );
  });

  it("groups punctuation and AI-suffix spelling variants", () => {
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer: "Scrunch.ai provides reporting." },
        { ...runs[1]!, answer: "Scrunch AI provides analytics." },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions).toEqual([
      expect.objectContaining({ name: "Scrunch", mentionCount: 2 }),
    ]);
  });

  it("discovers international and apostrophe brand names", () => {
    const answer = "Škoda, L’Oréal, and Яндекс are frequently recommended.";
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer },
        { ...runs[1]!, answer },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions.map((item) => item.name).sort()).toEqual(
      ["L’Oréal", "Škoda", "Яндекс"].sort(),
    );
  });

  it("discovers emphasized lowercase and caseless-script brands", () => {
    const answer = "Options include **monday.com** and **トヨタ**.";
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer },
        { ...runs[1]!, answer },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions.map((item) => item.name).sort()).toEqual(
      ["monday.com", "トヨタ"].sort(),
    );
  });

  it("keeps connector words inside multi-word brand names", () => {
    const answer = "Bank of America and Procter & Gamble are options.";
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer },
        { ...runs[1]!, answer },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions.map((item) => item.name).sort()).toEqual(
      ["Bank of America", "Procter & Gamble"].sort(),
    );
  });

  it("does not turn repeated sentence-opening prose into competitors", () => {
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer: "However, many teams need clear reporting." },
        {
          ...runs[1]!,
          answer: "However, this depends on budget. Many options exist.",
        },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions).toEqual([]);
  });

  it("accepts corroboration from multiple providers on the same prompt", () => {
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer: "Profound is a leading option." },
        {
          ...runs[1]!,
          promptId: runs[0]!.promptId,
          prompt: runs[0]!.prompt,
          answer: "Profound offers enterprise reporting.",
        },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions).toEqual([
      expect.objectContaining({
        name: "Profound",
        promptCount: 1,
        providerCount: 2,
      }),
    ]);
  });

  it("does not merge Markdown lines or suggest repeated generic headings", () => {
    const answer = [
      "## Top Tools",
      "- Profound",
      "- Scrunch AI",
      "",
      "Here are the strongest options.",
    ].join("\n");
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer },
        { ...runs[1]!, answer },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions.map((item) => item.name)).toEqual([
      "Profound",
      "Scrunch",
    ]);
  });

  it("excludes generic category phrases without blocking mixed brand names", () => {
    const answer = "AI Visibility Tools include Amazon Web Services.";
    const result = discoverCompetitors({
      runs: [
        { ...runs[0]!, answer },
        { ...runs[1]!, answer },
      ],
      brand: { name: "AeoKit" },
      existingCompetitors: [],
      minimumMentions: 2,
    });

    expect(result.suggestions.map((item) => item.name)).toEqual([
      "Amazon Web Services",
    ]);
  });

  it("only resurfaces a dismissal when evidence gains prompt or provider diversity", () => {
    const baseline = {
      mentionCount: 2,
      promptCount: 2,
      providerCount: 1,
      evidenceRunIds: ["run-1", "run-2"],
      evidencePromptIds: ["prompt-1", "prompt-2"],
      evidenceProviders: ["openai"],
      dismissedAt: "2026-08-21T12:00:00.000Z",
    };
    expect(
      hasMateriallyNewEvidence(baseline, {
        mentionCount: 3,
        promptCount: 2,
        providerCount: 1,
        evidence: [
          {
            runId: "run-4",
            promptId: "prompt-1",
            prompt: "Prompt 1",
            provider: "openai",
            model: "model",
            excerpt: "Profound",
            completedAt: "2026-08-22T00:00:00.000Z",
          },
        ],
      }),
    ).toBe(false);
    expect(
      hasMateriallyNewEvidence(baseline, {
        mentionCount: 3,
        promptCount: 3,
        providerCount: 1,
        evidence: [
          {
            runId: "run-5",
            promptId: "prompt-3",
            prompt: "Prompt 3",
            provider: "openai",
            model: "model",
            excerpt: "Profound",
            completedAt: "2026-08-22T00:00:00.000Z",
          },
        ],
      }),
    ).toBe(true);
  });

  it("detects new provider identity when rolling-window counts stay equal", () => {
    expect(
      hasMateriallyNewEvidence(
        {
          mentionCount: 2,
          promptCount: 2,
          providerCount: 2,
          evidenceRunIds: ["old-1", "old-2"],
          evidencePromptIds: ["prompt-1", "prompt-2"],
          evidenceProviders: ["openai", "anthropic"],
          dismissedAt: "2026-08-22T00:00:00.000Z",
        },
        {
          mentionCount: 2,
          promptCount: 2,
          providerCount: 2,
          evidence: [
            {
              runId: "new-1",
              promptId: "prompt-1",
              prompt: "Prompt",
              provider: "openrouter",
              model: "model",
              excerpt: "Profound",
              completedAt: "2026-08-23T00:00:00.000Z",
            },
          ],
        },
      ),
    ).toBe(true);
  });

  it("does not treat older evidence revealed by a wider history range as new", () => {
    expect(
      hasMateriallyNewEvidence(
        {
          mentionCount: 2,
          promptCount: 2,
          providerCount: 1,
          evidenceRunIds: ["run-2", "run-3"],
          evidencePromptIds: ["prompt-2", "prompt-3"],
          evidenceProviders: ["anthropic", "openai"],
          dismissedAt: "2026-08-23T00:00:00.000Z",
        },
        {
          mentionCount: 3,
          promptCount: 3,
          providerCount: 2,
          evidence: runs.map((run) => ({
            runId: run.id,
            promptId: run.promptId,
            prompt: run.prompt,
            provider: run.provider,
            model: run.model,
            excerpt: run.answer,
            completedAt: run.completedAt,
          })),
        },
      ),
    ).toBe(false);
  });
});

describe("encoded payload candidates", () => {
  function suggestionsFor(answer: string) {
    return discoverCompetitors({
      runs: [1, 2].map((n) => ({
        id: `run-${n}`,
        promptId: `prompt-${n}`,
        prompt: "best ecommerce platform",
        provider: n === 1 ? "brightdata" : "dataforseo",
        model: "chatgpt",
        answer,
        completedAt: "2026-08-28T12:00:00.000Z",
      })),
      brand: { name: "MacSpotter", aliases: [], domains: [] },
      existingCompetitors: [],
      minimumMentions: 2,
    }).suggestions.map((suggestion) => suggestion.name);
  }

  const payload =
    "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5QFgvdUtSxW0v0AAAAASUVORK5CYII=";

  it("does not offer an inlined image payload as a competitor", () => {
    const names = suggestionsFor(
      `Squarespace leads. ![](data:image/png;base64,${payload}) Shopify follows.`,
    );

    expect(names).toEqual(["Shopify", "Squarespace"]);
  });

  it("does not fuse the names either side of an inlined image", () => {
    // Removing the image closes the gap, and the capitalised-run pattern joins
    // across spaces — so "A <img> B" became the single candidate "A B", a name
    // that never appeared, while losing both real ones.
    expect(
      suggestionsFor(
        `Squarespace ![](data:image/png;base64,${payload}) Shopify are the leaders.`,
      ),
    ).toEqual(["Shopify", "Squarespace"]);
    // The production shape: a favicon immediately before each source name.
    expect(
      suggestionsFor(
        `1. ![](data:image/png;base64,${payload}) Shopify\n2. ![](data:image/png;base64,${payload}) BigCommerce`,
      ),
    ).toEqual(["BigCommerce", "Shopify"]);
  });

  it("redacts a payload embedded outside markdown image syntax", () => {
    // stripDataUriImages only matches "![](…)", so an HTML img leaked
    // "ASUVORK5CYII" into the approval list.
    expect(
      suggestionsFor(
        `Shopify leads. <img src="data:image/png;base64,${payload}"> Wix follows.`,
      ),
    ).toEqual(["Shopify", "Wix"]);
  });

  it("rejects encoded fragments that still reach extraction", () => {
    // The capitalised-run pattern splits a blob at "/" and "=", so fragments
    // arriving here are shorter than a whole payload.
    const fragments = [
      "DTW0OvNO0h2GHhK8ImE",
      "Y4heAXA3JKTSW8vg7ojIp",
      "ASUVORK5CYII",
    ];

    expect(
      suggestionsFor(`Options include ${fragments.join(" and ")} for stores.`),
    ).toEqual([]);
  });

  it("cuts evidence from the redacted answer, not the raw one", () => {
    const [suggestion] = discoverCompetitors({
      runs: [1, 2].map((n) => ({
        id: `run-${n}`,
        promptId: `prompt-${n}`,
        prompt: "best ecommerce platform",
        provider: n === 1 ? "brightdata" : "dataforseo",
        model: "chatgpt",
        answer: `Squarespace leads. ![](data:image/png;base64,${payload}) Shopify follows.`,
        completedAt: "2026-08-28T12:00:00.000Z",
      })),
      brand: { name: "MacSpotter", aliases: [], domains: [] },
      existingCompetitors: [],
      minimumMentions: 2,
    }).suggestions.filter((item) => item.name === "Shopify");

    expect(suggestion?.evidence[0]?.excerpt).not.toContain("base64");
  });

  it("never suggests a name that does not appear in the answer", () => {
    // Removing a word from the middle of a candidate fuses its neighbours:
    // "Adobe Shift4Shop Commerce" became the suggestion "Adobe Commerce".
    // A user would approve a brand the answer never mentioned.
    expect(
      suggestionsFor("Adobe Shift4Shop Commerce is popular."),
    ).not.toContain("Adobe Commerce");
    expect(
      suggestionsFor("Try Wix Microsoft365 Studio for sites."),
    ).not.toContain("Wix Studio");
  });

  it("keeps brand names a shape heuristic would reject", () => {
    // Shift4Shop is the current name of 3dcart. Each of these was lost to an
    // earlier "looks encoded" score.
    expect(
      suggestionsFor("Try Volusion and Ecwid, plus Shift4Shop today."),
    ).toContain("Shift4Shop");
    expect(
      suggestionsFor("Consider Microsoft365 and Salesforce1 and PrestaShop8."),
    ).toEqual(["Microsoft365", "PrestaShop8", "Salesforce1"]);
    expect(
      suggestionsFor("Use Salesforce-Commerce-Cloud for enterprise."),
    ).toContain("Salesforce-Commerce-Cloud");
  });

  it("keeps non-Latin-script brand names", () => {
    // An ASCII vowel test rejects every one of these, which would leave a
    // non-English deployment with no competitor discovery at all.
    const names = suggestionsFor("Look at Сбербанк and Вконтакте options.");

    expect(names).toContain("Сбербанк");
    expect(names).toContain("Вконтакте");
  });

  it("does not surface a leading verb as a competitor", () => {
    expect(suggestionsFor("Try PrestaShop8 and WooCommerce6 today.")).toEqual([
      "PrestaShop8",
      "WooCommerce6",
    ]);
  });
});
