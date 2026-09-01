import { describe, expect, it } from "vitest";
import {
  appPath,
  brandAppPath,
  brandIdFromPath,
  promptOnboardingPath,
} from "./app-routing";

describe("application domain routing", () => {
  it("mounts the self-hosted product beneath the runtime app path", () => {
    expect(appPath("/app", "/visibility")).toBe("/app/visibility");
    expect(appPath("/app", "/")).toBe("/app");
  });

  it("puts the active brand in application URLs", () => {
    expect(brandAppPath("", "brand-123", "/visibility")).toBe(
      "/brands/brand-123/visibility",
    );
    expect(brandAppPath("/app", "brand 123", "/prompts")).toBe(
      "/app/brands/brand%20123/prompts",
    );
    expect(brandIdFromPath("", "/brands/brand-123/visibility")).toBe(
      "brand-123",
    );
    expect(brandIdFromPath("/app", "/app/brands/brand%20123/prompts")).toBe(
      "brand 123",
    );
    expect(brandIdFromPath("/app", "/app/visibility")).toBeNull();
  });

  it("continues first-brand onboarding at the prompt review step", () => {
    expect(promptOnboardingPath("/app", "brand 123")).toBe(
      "/app/brands/brand%20123/prompts",
    );
    expect(promptOnboardingPath("", "brand-123")).toBe(
      "/brands/brand-123/prompts",
    );
  });
});
