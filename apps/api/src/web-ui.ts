import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "hono";

const webRoot = resolve(
  fileURLToPath(new URL("../../web/dist/", import.meta.url)),
);
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function assetResponse(context: Context, relativePath: string) {
  const path = resolve(webRoot, relativePath);
  if (path !== webRoot && !path.startsWith(`${webRoot}${sep}`)) {
    return context.json({ error: "Not found" }, 404);
  }
  try {
    const body = await readFile(path);
    context.header(
      "Content-Type",
      contentTypes[extname(path)] ?? "application/octet-stream",
    );
    if (relativePath.startsWith("assets/")) {
      context.header("Cache-Control", "public, max-age=31536000, immutable");
    }
    return context.body(new Uint8Array(body));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return null;
  }
}

export async function serveProductUi(context: Context) {
  const relativePath = context.req.path.replace(/^\/app\/?/, "");
  if (relativePath && extname(relativePath)) {
    const asset = await assetResponse(context, relativePath);
    if (asset) return asset;
    return context.json({ error: "Not found" }, 404);
  }
  const index = await assetResponse(context, "index.html");
  if (index) return index;
  return context.json(
    {
      error:
        "The product UI has not been built. Run pnpm --filter @aeokit/web build.",
    },
    503,
  );
}
