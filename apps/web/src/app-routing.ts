export function appPath(basePath: string, path = "/"): string {
  const suffix = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${suffix}` || "/";
}

export function brandAppPath(
  basePath: string,
  brandId: string,
  path = "/",
): string {
  return appPath(
    basePath,
    `/brands/${encodeURIComponent(brandId)}${path === "/" ? "" : path.startsWith("/") ? path : `/${path}`}`,
  );
}

export function promptOnboardingPath(
  basePath: string,
  brandId: string,
): string {
  return brandAppPath(basePath, brandId, "/prompts");
}

export function brandIdFromPath(
  basePath: string,
  pathname: string,
): string | null {
  const relativePath = pathname.slice(basePath.length);
  if (basePath && !pathname.startsWith(`${basePath}/`)) return null;
  const match = /^\/brands\/([^/]+)(?:\/|$)/.exec(relativePath);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function brandPagePath(basePath: string, pathname: string): string {
  const relativePath = pathname.slice(basePath.length) || "/";
  const match = /^\/brands\/[^/]+(\/.*)?$/.exec(relativePath);
  return match?.[1] || (relativePath.startsWith("/") ? relativePath : "/");
}
