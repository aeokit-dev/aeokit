import { describe, expect, it, vi } from "vitest";
import {
  isRetryableProviderError,
  retryDelay,
  retryWithBackoff,
} from "./retry";

describe("provider retries", () => {
  it("retries transient failures with exponential backoff", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("request failed (429): busy"))
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue("ok");
    const attempts: number[] = [];
    const delays: number[] = [];

    await expect(
      retryWithBackoff(() => operation(), {
        maxAttempts: 3,
        baseDelayMs: 100,
        shouldRetry: isRetryableProviderError,
        onAttempt: ({ attempt }) => {
          attempts.push(attempt);
        },
        sleep: async (delay) => {
          delays.push(delay);
        },
      }),
    ).resolves.toBe("ok");

    expect(attempts).toEqual([1, 2, 3]);
    expect(delays).toEqual([100, 200]);
  });

  it("does not retry configuration or validation failures", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("OpenAI is not configured"));

    await expect(
      retryWithBackoff(() => operation(), {
        maxAttempts: 3,
        baseDelayMs: 0,
        shouldRetry: isRetryableProviderError,
      }),
    ).rejects.toThrow("not configured");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("resumes from the recorded attempt count", async () => {
    const attempts: number[] = [];
    await retryWithBackoff(async ({ attempt }) => attempt, {
      maxAttempts: 3,
      startingAttempt: 2,
      baseDelayMs: 0,
      onAttempt: ({ attempt }) => {
        attempts.push(attempt);
      },
    });
    expect(attempts).toEqual([3]);
    expect(retryDelay(3, 1_000)).toBe(4_000);
  });
});
