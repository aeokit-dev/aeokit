import { describe, expect, it } from "vitest";
import {
  readQueryParam,
  readQueryText,
  updateQueryParam,
} from "./url-search-params";

const periods = ["7d", "30d", "90d"] as const;

describe("URL search parameter state", () => {
  it.each(["", "period=", "period=forever"])(
    "uses the page default for an invalid period in %s",
    (query) => {
      expect(
        readQueryParam(new URLSearchParams(query), "period", periods, "30d"),
      ).toBe("30d");
    },
  );

  it.each([
    ["period=90d", "period", ["7d", "30d", "90d"], "30d", "90d"],
    ["status=all", "status", ["open", "all"], "open", "all"],
    [
      "type=content_authority",
      "type",
      ["all", "content_authority"],
      "all",
      "content_authority",
    ],
  ] as const)(
    "retains an allowed value from %s",
    (query, key, allowed, fallback, expected) => {
      expect(
        readQueryParam(new URLSearchParams(query), key, allowed, fallback),
      ).toBe(expected);
    },
  );

  it("reads free-form text but treats blank text as empty", () => {
    expect(readQueryText(new URLSearchParams("search=pricing"), "search")).toBe(
      "pricing",
    );
    expect(readQueryText(new URLSearchParams("search=+++"), "search")).toBe("");
  });

  it("sets a non-default value without changing unrelated parameters", () => {
    const current = new URLSearchParams("search=failed&tab=costs");
    const next = updateQueryParam(current, "period", "90d", "30d");

    expect(next.toString()).toBe("search=failed&tab=costs&period=90d");
    expect(current.toString()).toBe("search=failed&tab=costs");
  });

  it.each([
    ["search=failed&period=90d", "search", "", "", "period=90d"],
    ["period=90d&search=failed", "period", "30d", "30d", "search=failed"],
    ["category=social&tab=domains", "category", "all", "all", "tab=domains"],
  ])(
    "removes only the cleared or default parameter",
    (query, key, value, fallback, expected) => {
      expect(
        updateQueryParam(
          new URLSearchParams(query),
          key,
          value,
          fallback,
        ).toString(),
      ).toBe(expected);
    },
  );
});
