/**
 * Read a query parameter whose value must belong to a page-owned allowlist.
 * Missing, blank, and unsupported values resolve to the documented default.
 */
export function readQueryParam<const Value extends string>(
  searchParams: URLSearchParams,
  key: string,
  allowedValues: readonly Value[],
  defaultValue: Value,
): Value {
  const value = searchParams.get(key);
  return value && allowedValues.includes(value as Value)
    ? (value as Value)
    : defaultValue;
}

/**
 * Read free-form query text while treating an empty or whitespace-only value
 * as the page default.
 */
export function readQueryText(
  searchParams: URLSearchParams,
  key: string,
): string {
  const value = searchParams.get(key);
  return value?.trim() ? value : "";
}

/**
 * Clone the current query string and update one page-owned value. Defaults and
 * blank values are removed so canonical URLs stay compact, while parameters
 * owned by other controls are preserved.
 */
export function updateQueryParam(
  searchParams: URLSearchParams,
  key: string,
  value: string,
  defaultValue = "",
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (!value.trim() || value === defaultValue) {
    next.delete(key);
  } else {
    next.set(key, value);
  }
  return next;
}
