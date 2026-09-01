import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UnavailableState } from "./CrawlerTrafficSection";

function render(code?: string, settingsTo = "../settings") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/brands/example"]}>
      <Routes>
        <Route
          path="brands/:brandId"
          element={<UnavailableState code={code} settingsTo={settingsTo} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CrawlerTraffic unavailable state", () => {
  it("explains that a new project needs Cloudflare and links to Settings", () => {
    const markup = render("cloudflare_not_configured", "settings");

    expect(markup).toContain("Cloudflare analytics is not connected");
    expect(markup).toContain("Connect Cloudflare");
    expect(markup).toContain('href="/brands/example/settings"');
  });

  it("preserves safe permission and zone explanations without a setup CTA", () => {
    const permission = render("cloudflare_insufficient_permissions");
    const zone = render("cloudflare_zone_not_found");

    expect(permission).toContain("permission to read");
    expect(permission).not.toContain("Connect Cloudflare");
    expect(zone).toContain("No accessible Cloudflare zone");
  });

  it("uses generic unavailable copy for unexpected failures", () => {
    const markup = render();

    expect(markup).toContain("Crawler analytics unavailable");
    expect(markup).toContain("temporarily unavailable");
    expect(markup).not.toContain("Authorization");
    expect(markup).not.toContain("Connect Cloudflare");
  });
});
