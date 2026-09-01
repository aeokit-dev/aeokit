import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDetailQueryOptions, runIdFromSearch } from "./run-detail-query";

function responseFor(id: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ run: { id } }),
  } as Response;
}

describe("run detail selection", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens a run linked from supporting evidence", () => {
    expect(runIdFromSearch(new URLSearchParams("run=run-evidence-1"))).toBe(
      "run-evidence-1",
    );
    expect(runIdFromSearch(new URLSearchParams())).toBeNull();
  });

  it("cancels the stale request when rows are clicked rapidly", async () => {
    let firstRequestAborted = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/runs/run-one")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            firstRequestAborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve(responseFor("run-two"));
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const observer = new QueryObserver(
      client,
      runDetailQueryOptions("run-one"),
    );
    const unsubscribe = observer.subscribe(() => undefined);

    observer.setOptions(runDetailQueryOptions("run-two"));

    await vi.waitFor(() => {
      expect(firstRequestAborted).toBe(true);
      expect(observer.getCurrentResult().data?.run.id).toBe("run-two");
    });
    unsubscribe();
    client.clear();
  });
});
