import { describe, expect, it } from "vitest";
import { mentionOutcomeLabel } from "./ui";

describe("mentionOutcomeLabel", () => {
  it("does not turn a failed run into a negative mention result", () => {
    expect(mentionOutcomeLabel("failed", false)).toBe("Unknown");
    expect(mentionOutcomeLabel("pending", false)).toBe("Unknown");
    expect(mentionOutcomeLabel("succeeded", false)).toBe("Not mentioned");
    expect(mentionOutcomeLabel("succeeded", true)).toBe("Mentioned");
  });
});
