import { describe, expect, it } from "vitest";
import { analyzeAnswer, classifyCitation, normalizeDomain } from "./analysis";

describe("answer analysis", () => {
  it("detects aliases, domains, and competitors", () => {
    const result = analyzeAnswer(
      "aeokit is useful. Teams also compare it with Acme and visit aeokit.dev.",
      { name: "aeokit", aliases: ["aeokit"], domains: ["aeokit.dev"] },
      [{ name: "Acme", domains: ["acme.test"] }],
    );
    expect(result).toEqual({
      brandMentioned: true,
      competitorsMentioned: ["Acme"],
    });
  });

  it("does not count names embedded in other words", () => {
    expect(
      analyzeAnswer("The elmwood tree", { name: "Elmo" }, []).brandMentioned,
    ).toBe(false);
  });
});

describe("citation classification", () => {
  it("classifies owned, competitor, social, and institutional domains", () => {
    const competitors = [{ name: "Acme", domains: ["acme.test"] }];
    expect(
      classifyCitation("blog.aeokit.dev", ["aeokit.dev"], competitors),
    ).toEqual({
      category: "owned",
    });
    expect(
      classifyCitation("www.acme.test", ["aeokit.dev"], competitors),
    ).toEqual({
      category: "competitor",
      competitorName: "Acme",
    });
    expect(classifyCitation("reddit.com", [], [])).toEqual({
      category: "social",
    });
    expect(classifyCitation("mit.edu", [], [])).toEqual({
      category: "institutional",
    });
  });

  it("normalizes URLs", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
  });
});
