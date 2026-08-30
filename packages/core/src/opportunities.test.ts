import { describe, expect, it } from "vitest";
import {
  analyzeEvidence,
  generateReliabilityOpportunity,
  generateRunOpportunities,
  normalizeCitationUrl,
} from "./opportunities";

const brand = {
  name: "MacSpotter",
  aliases: ["Mac Spotter"],
  domains: ["macspotter.com"],
};

describe("citation URL normalization", () => {
  it("keeps the raw URL while removing tracking from the canonical URL", () => {
    expect(
      normalizeCitationUrl({
        url: "https://www.Example.com/report?utm_source=chatgpt&id=42#proof",
        domain: "www.example.com",
        title: "Inventory research",
        position: 1,
      }),
    ).toEqual({
      rawUrl: "https://www.Example.com/report?utm_source=chatgpt&id=42#proof",
      finalUrl: "https://www.Example.com/report?utm_source=chatgpt&id=42#proof",
      canonicalUrl: "https://example.com/report?id=42",
      domain: "example.com",
      pageTitle: "Inventory research",
      position: 1,
    });
  });

  it("unwraps encoded Google redirect destinations", () => {
    expect(
      normalizeCitationUrl({
        url: "https://www.google.com/goto?url=https%3A%2F%2Facme.com%2Fresearch%3Futm_campaign%3Dai",
        domain: "google.com",
        position: 2,
      }),
    ).toEqual(
      expect.objectContaining({
        finalUrl: "https://acme.com/research?utm_campaign=ai",
        canonicalUrl: "https://acme.com/research",
        domain: "acme.com",
      }),
    );
  });
});

describe("evidence extraction", () => {
  it("extracts recommendation quality, sentiment, and brand claims", () => {
    const result = analyzeEvidence(
      "MacSpotter is the best overall choice. MacSpotter maintains historical inventory data.",
      brand,
      [],
    );

    expect(result).toEqual(
      expect.objectContaining({
        brandMentioned: true,
        recommendationRank: 1,
        recommendationStrength: "best_overall",
        sentiment: "positive",
      }),
    );
    expect(result.claims).toContainEqual(
      expect.objectContaining({
        text: "MacSpotter maintains historical inventory data.",
      }),
    );
  });
});

describe("deterministic opportunity rules", () => {
  it("creates citation and authority gaps from competitor-only citations", () => {
    const analysis = analyzeEvidence("MacSpotter is a strong option.", brand, [
      { name: "Acme", domains: ["acme.com"] },
    ]);
    const opportunities = generateRunOpportunities({
      projectId: "project-1",
      promptId: "prompt-1",
      runId: "run-1",
      provider: "openai",
      analysis,
      citations: [
        {
          rawUrl: "https://acme.com/research",
          finalUrl: "https://acme.com/research",
          canonicalUrl: "https://acme.com/research",
          domain: "acme.com",
          pageTitle: "Acme research",
          position: 1,
          category: "competitor",
          competitorName: "Acme",
        },
      ],
      observationCount: 3,
      agreeingProviders: 2,
    });

    expect(opportunities.map((item) => item.type)).toEqual([
      "citation_gap",
      "content_authority",
    ]);
    expect(opportunities[0]).toEqual(
      expect.objectContaining({
        confidence: expect.any(Number),
        evidenceIds: ["run-1"],
        affectedPromptIds: ["prompt-1"],
        affectedUrls: ["https://acme.com/research"],
      }),
    );
  });

  it("creates the remaining run-level opportunity types from explicit evidence", () => {
    const winning = generateRunOpportunities({
      projectId: "project-1",
      promptId: "prompt-winning",
      runId: "run-winning",
      provider: "openai",
      analysis: analyzeEvidence(
        "MacSpotter is the best overall choice.",
        brand,
        [],
      ),
      citations: [
        {
          rawUrl: "https://macspotter.com/inventory",
          finalUrl: "https://macspotter.com/inventory",
          canonicalUrl: "https://macspotter.com/inventory",
          domain: "macspotter.com",
          pageTitle: "Inventory",
          position: 1,
          category: "owned",
        },
      ],
      observationCount: 4,
      agreeingProviders: 3,
    });
    expect(winning.map((item) => item.type)).toContain("winning_message");

    const competitorAdvantage = generateRunOpportunities({
      projectId: "project-1",
      promptId: "prompt-competitor",
      runId: "run-competitor",
      provider: "anthropic",
      analysis: analyzeEvidence("Acme is the leading option.", brand, [
        { name: "Acme", domains: ["acme.com"] },
      ]),
      citations: [],
      observationCount: 1,
      agreeingProviders: 1,
    });
    expect(competitorAdvantage.map((item) => item.type)).toContain(
      "competitor_advantage",
    );

    const unsupportedClaim = generateRunOpportunities({
      projectId: "project-1",
      promptId: "prompt-claim",
      runId: "run-claim",
      provider: "openai",
      analysis: analyzeEvidence(
        "MacSpotter maintains historical inventory data.",
        brand,
        [],
      ),
      citations: [],
      observationCount: 1,
      agreeingProviders: 1,
    });
    expect(unsupportedClaim.map((item) => item.type)).toContain(
      "unsupported_claim",
    );
  });

  it("creates a reliability warning only after repeated recent failures", () => {
    const warning = generateReliabilityOpportunity({
      projectId: "project-1",
      provider: "brightdata",
      observations: [
        { runId: "run-1", status: "failed" },
        { runId: "run-2", status: "failed" },
        { runId: "run-3", status: "succeeded" },
        { runId: "run-4", status: "failed" },
        { runId: "run-5", status: "succeeded" },
      ],
    });

    expect(warning).toEqual(
      expect.objectContaining({
        type: "reliability_warning",
        evidenceIds: ["run-1", "run-2", "run-4"],
      }),
    );
    expect(
      generateReliabilityOpportunity({
        projectId: "project-1",
        provider: "openai",
        observations: [
          { runId: "run-1", status: "failed" },
          { runId: "run-2", status: "succeeded" },
        ],
      }),
    ).toBeNull();
  });
});
