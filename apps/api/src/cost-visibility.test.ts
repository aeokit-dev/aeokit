import { describe, expect, it } from "vitest";
import {
  redactProviderCosts,
  runDetail,
  runSummary,
  shouldShowProviderCosts,
} from "./cost-visibility";

describe("provider cost visibility", () => {
  it("shows costs by default outside hosted deployments", () => {
    expect(shouldShowProviderCosts({})).toBe(true);
    expect(shouldShowProviderCosts({ DEPLOYMENT_MODE: "hosted" })).toBe(false);
  });

  it("lets SHOW_PROVIDER_COSTS explicitly override the deployment default", () => {
    expect(
      shouldShowProviderCosts({
        DEPLOYMENT_MODE: "hosted",
        SHOW_PROVIDER_COSTS: "true",
      }),
    ).toBe(true);
    expect(shouldShowProviderCosts({ SHOW_PROVIDER_COSTS: "false" })).toBe(
      false,
    );
  });

  it("removes nested provider billing fields without removing response data", () => {
    expect(
      redactProviderCosts({
        answer: "Visible",
        cost: 0.004,
        usage: {
          total_tokens: 100,
          cost_details: { upstream_inference_cost: 0.003 },
        },
        tasks: [
          { cost: 0.004, result: [{ money_spent: 0.003 }], status: "ok" },
        ],
      }),
    ).toEqual({
      answer: "Visible",
      usage: { total_tokens: 100 },
      tasks: [{ result: [{}], status: "ok" }],
    });
  });

  it("omits raw output from summaries and cost from hosted details", () => {
    const run = {
      id: "run-1",
      costUsd: 0.004,
      rawOutput: { answer: "Visible", cost: 0.004 },
    };
    expect(runSummary(run, true)).toEqual({ id: "run-1", costUsd: 0.004 });
    expect(runSummary(run, false)).toEqual({ id: "run-1" });
    expect(runDetail(run, false)).toEqual({
      id: "run-1",
      rawOutput: { answer: "Visible" },
    });
  });
});
