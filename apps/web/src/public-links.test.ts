import { describe, expect, it } from "vitest";
import {
  COMMUNITY_URL,
  DOCUMENTATION_URL,
  PUBLIC_LICENSE_NAME,
  PUBLIC_REPOSITORY_URL,
} from "./public-links";

describe("public aeokit links", () => {
  it("points the product, documentation, and community links at the public repository", () => {
    expect(PUBLIC_REPOSITORY_URL).toBe("https://github.com/aeokit-dev/aeokit");
    expect(DOCUMENTATION_URL).toBe(
      "https://github.com/aeokit-dev/aeokit#readme",
    );
    expect(COMMUNITY_URL).toBe(
      "https://github.com/aeokit-dev/aeokit/discussions",
    );
    expect(PUBLIC_LICENSE_NAME).toBe("AGPL-3.0");
  });
});
