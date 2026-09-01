import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("switches wordmarks using the applied app theme", () => {
    const html = renderToStaticMarkup(<BrandLogo />);
    const styles = readFileSync(
      new URL("../styles.css", import.meta.url),
      "utf8",
    );

    expect(html).toContain("brand-logo-light");
    expect(html).toContain("brand-logo-dark");
    expect(styles).toContain('[data-theme="openaeo-dark"] .brand-logo-light');
    expect(styles).toContain('[data-theme="openaeo-dark"] .brand-logo-dark');
  });
});
