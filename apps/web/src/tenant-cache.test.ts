import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetTenantClientState,
  setActiveOrganizationId,
  tenantQueryKey,
} from "./api";

describe("tenant-scoped query state", () => {
  afterEach(() => setActiveOrganizationId(null));

  it("uses distinct keys and clears cached data when organizations switch", () => {
    const client = new QueryClient();
    resetTenantClientState(client, "org_a");
    const orgAKey = tenantQueryKey("projects");
    client.setQueryData(orgAKey, { projects: [{ id: "project-a" }] });

    resetTenantClientState(client, "org_b");
    const orgBKey = tenantQueryKey("projects");

    expect(orgBKey).not.toEqual(orgAKey);
    expect(client.getQueryData(orgAKey)).toBeUndefined();
    expect(client.getQueryData(orgBKey)).toBeUndefined();
  });
});
