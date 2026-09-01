import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { tenantQueryKey } from "../api";
import { ApiKeysPanel } from "./ApiKeysPanel";

describe("ApiKeysPanel", () => {
  it("distinguishes a loaded empty key list from a request that never loaded", () => {
    const client = new QueryClient();
    client.setQueryData(tenantQueryKey("api-keys"), { apiKeys: [] });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ApiKeysPanel />
      </QueryClientProvider>,
    );

    expect(html).toContain("No API keys yet");
  });
});
