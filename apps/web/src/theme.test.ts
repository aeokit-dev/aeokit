import { describe, expect, it } from "vitest";
import { resolveThemeName } from "./theme";

describe("resolveThemeName", () => {
  it("maps explicit and system preferences to aeokit themes", () => {
    expect(resolveThemeName("light", true)).toBe("openaeo");
    expect(resolveThemeName("dark", false)).toBe("openaeo-dark");
    expect(resolveThemeName("system", false)).toBe("openaeo");
    expect(resolveThemeName("system", true)).toBe("openaeo-dark");
  });
});
