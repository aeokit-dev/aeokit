import { describe, expect, it, vi } from "vitest";
import type { MonitorRun, RunMonitorResponse } from "./types";
import { fetchAllRunMonitorRows, runMonitorCsv } from "./run-monitor-export";

const run = (index: number): MonitorRun => ({
  id: `run-${index}`,
  promptId: `prompt-${index}`,
  promptValue: `Prompt ${index}`,
  projectId: "3cf10235-58f7-4fe9-9a53-070c0c796955",
  projectName: "Shopify",
  provider: "openai",
  model: "gpt-5",
  status: "succeeded",
  attemptCount: 1,
  lastAttemptAt: "2026-08-29T17:00:00.000Z",
  answer: null,
  brandMentioned: true,
  recommendationRank: null,
  recommendationStrength: null,
  sentiment: "neutral",
  competitorsMentioned: [],
  webQueries: [],
  error: null,
  latencyMs: 1000,
  costUsd: 0.01,
  createdAt: "2026-08-29T17:00:00.000Z",
  completedAt: "2026-08-29T17:00:01.000Z",
  batchId: null,
  trigger: "manual",
});

const response = (
  page: number,
  runs: MonitorRun[],
  total = 36,
  pageSize = 25,
): RunMonitorResponse => ({
  counts: {
    pending: 0,
    running: 0,
    succeeded: 30,
    failed: 6,
    cancelled: 0,
  },
  batches: [],
  total,
  page,
  pageSize,
  runs,
});

describe("Run Monitor export", () => {
  it("fetches every page of the filtered result instead of exporting only the first 25 rows", async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => run(index));
    const secondPage = Array.from({ length: 11 }, (_, index) =>
      run(index + 25),
    );
    const request = vi
      .fn<(path: string) => Promise<RunMonitorResponse>>()
      .mockResolvedValueOnce(response(1, firstPage))
      .mockResolvedValueOnce(response(2, secondPage));

    const rows = await fetchAllRunMonitorRows(
      new URLSearchParams({
        projectId: "3cf10235-58f7-4fe9-9a53-070c0c796955",
      }),
      request,
    );

    expect(rows).toHaveLength(36);
    expect(runMonitorCsv(rows).split("\n")).toHaveLength(37);
    expect(request).toHaveBeenNthCalledWith(
      1,
      "/run-monitor?projectId=3cf10235-58f7-4fe9-9a53-070c0c796955&pageSize=100&page=1",
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/run-monitor?projectId=3cf10235-58f7-4fe9-9a53-070c0c796955&pageSize=100&page=2",
    );
  });

  it("fetches a second 100-row page while preserving every active filter", async () => {
    const request = vi
      .fn<(path: string) => Promise<RunMonitorResponse>>()
      .mockResolvedValueOnce(
        response(
          1,
          Array.from({ length: 100 }, (_, index) => run(index)),
          108,
          100,
        ),
      )
      .mockResolvedValueOnce(
        response(
          2,
          Array.from({ length: 8 }, (_, index) => run(index + 100)),
          108,
          100,
        ),
      );

    const rows = await fetchAllRunMonitorRows(
      new URLSearchParams({
        projectId: "project-id",
        status: "failed",
        provider: "openai",
        page: "4",
      }),
      request,
    );

    expect(rows).toHaveLength(108);
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/run-monitor?projectId=project-id&status=failed&provider=openai&pageSize=100&page=2",
    );
  });

  it("stops when the server returns an empty page before its reported total", async () => {
    const request = vi
      .fn<(path: string) => Promise<RunMonitorResponse>>()
      .mockResolvedValueOnce(
        response(
          1,
          Array.from({ length: 100 }, (_, index) => run(index)),
          200,
          100,
        ),
      )
      .mockResolvedValueOnce(response(2, [], 200, 100));

    await expect(
      fetchAllRunMonitorRows(
        new URLSearchParams({ search: "timeout" }),
        request,
      ),
    ).resolves.toHaveLength(100);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
