const truthyValues = new Set(["1", "true", "yes", "on"]);

export function shouldShowProviderCosts(env = process.env): boolean {
  const configured = env.SHOW_PROVIDER_COSTS?.trim().toLowerCase();
  if (configured) return truthyValues.has(configured);
  return env.DEPLOYMENT_MODE !== "hosted";
}

function isCostKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "cost" ||
    normalized === "cost_details" ||
    normalized === "money_spent" ||
    normalized.endsWith("_cost") ||
    normalized.endsWith("_cost_usd")
  );
}

export function redactProviderCosts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProviderCosts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isCostKey(key))
      .map(([key, child]) => [key, redactProviderCosts(child)]),
  );
}

export function runSummary<
  T extends { rawOutput?: unknown; costUsd?: number | null },
>(run: T, showProviderCosts: boolean) {
  const { rawOutput: _rawOutput, costUsd, ...summary } = run;
  return showProviderCosts ? { ...summary, costUsd } : summary;
}

export function runDetail<
  T extends { rawOutput?: unknown; costUsd?: number | null },
>(run: T, showProviderCosts: boolean) {
  if (showProviderCosts) return run;
  const { costUsd: _costUsd, ...visible } = run;
  return {
    ...visible,
    rawOutput: redactProviderCosts(visible.rawOutput),
  };
}
