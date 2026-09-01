import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = new URL(".", import.meta.url);

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, sourceRoot), "utf8");
}

function productionTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTsxFiles(path);
    return extname(entry.name) === ".tsx" && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

describe("OpenSEO typography contract", () => {
  it("uses the OpenSEO application hierarchy for navigation and panels", () => {
    const sidebar = readSource("components/Sidebar.tsx");
    const productionSource = productionTsxFiles(sourceRoot.pathname)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(sidebar).toContain(
      "bg-base-100 font-medium text-base-content shadow-sm",
    );
    expect(productionSource).not.toContain(
      '<h2 className="text-sm font-semibold">',
    );
  });

  it("uses OpenSEO table and rendered-answer sizing", () => {
    const styles = readSource("styles.css");
    const productionSource = productionTsxFiles(sourceRoot.pathname)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const tableClasses = Array.from(
      productionSource.matchAll(/<table\s+className="([^"]+)"/g),
      (match) => match[1] ?? "",
    );

    expect(tableClasses.length).toBeGreaterThan(0);
    expect(
      tableClasses.every((className) => className.includes("table-sm")),
    ).toBe(true);
    expect(styles).toMatch(/\.markdown-answer h1\s*{[^}]*@apply text-base;/s);
    expect(styles).toMatch(
      /\.markdown-answer :where\(h2, h3, h4\)\s*{[^}]*@apply text-sm;/s,
    );
    expect(styles).not.toContain(
      "@apply bg-base-200/60 text-xs font-semibold uppercase tracking-wide",
    );
    expect(styles).not.toContain(".table :where(td)");
  });
});
