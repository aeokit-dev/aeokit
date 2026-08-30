import { describe, expect, it, vi } from "vitest";
import { citationSurfaceCoverage, describeSurface } from "./surfaces.js";
import { stripDataUriImages } from "./providers/shared.js";

describe("citation surface coverage", () => {
  it("reports a surface that answered but cited nothing", () => {
    const coverage = citationSurfaceCoverage([
      {
        provider: "brightdata",
        model: "gemini",
        successfulRuns: 2,
        citations: 20,
      },
      {
        provider: "brightdata",
        model: "google-ai-mode",
        successfulRuns: 2,
        citations: 0,
      },
    ]);

    expect(coverage).toEqual([
      {
        surface: "Gemini",
        provider: "brightdata",
        model: "gemini",
        providerLabel: "Bright Data",
        successfulRuns: 2,
        citations: 20,
        sourcesUnavailable: false,
      },
      {
        surface: "Google AI Mode",
        provider: "brightdata",
        model: "google-ai-mode",
        providerLabel: "Bright Data",
        successfulRuns: 2,
        citations: 0,
        sourcesUnavailable: true,
      },
    ]);
  });

  it("does not flag a surface that has no successful runs at all", () => {
    expect(citationSurfaceCoverage([])).toEqual([]);
    expect(
      citationSurfaceCoverage([
        {
          provider: "brightdata",
          model: "gemini",
          successfulRuns: 0,
          citations: 0,
        },
      ])[0]?.sourcesUnavailable,
    ).toBe(false);
  });

  it("coerces string counts from drivers that return count() as text", () => {
    const [row] = citationSurfaceCoverage([
      {
        provider: "brightdata",
        model: "gemini",
        successfulRuns: "3" as unknown as number,
        citations: "7" as unknown as number,
      },
    ]);
    expect(row).toMatchObject({ successfulRuns: 3, citations: 7 });
  });
});

describe("stripDataUriImages", () => {
  // Shaped after the production Google AI Mode payload, where four inlined
  // favicons were 9,996 of a 12,057-character answer.
  const favicon = `![](data:image/png;base64,${"iVBORw0KGgo".repeat(200)})`;

  it("removes inlined data-uri images and keeps the prose", () => {
    const answer = `Squarespace is a strong pick. ${favicon} Shopify scales further. ${favicon}`;
    const stripped = stripDataUriImages(answer);

    expect(stripped).toBe(
      "Squarespace is a strong pick. Shopify scales further.",
    );
    expect(stripped.length).toBeLessThan(answer.length / 10);
  });

  it("leaves ordinary markdown links and images alone", () => {
    const answer =
      "See [the guide](https://example.com/guide) and ![chart](https://example.com/c.png).";
    expect(stripDataUriImages(answer)).toBe(answer);
  });

  it("returns an empty string when the answer was only images", () => {
    expect(stripDataUriImages(favicon)).toBe("");
  });

  it("preserves markdown indentation, which is significant", () => {
    const nested = "- Squarespace\n    - Best for portfolios\n- Shopify";
    expect(stripDataUriImages(nested)).toBe(nested);
  });

  it("leaves an unterminated data uri and the prose after it untouched", () => {
    // The URI is truncated mid-payload and a later line closes a parenthesis
    // it never opened — a smiley is enough. A character class permissive
    // enough for url-encoded SVG runs from the image's "(" all the way to that
    // ")" and deletes everything between. Against the previous implementation
    // this input collapsed from 115 characters to 24, and the stored answer is
    // the audit record, so the loss is unrecoverable.
    const answer = [
      "![](data:image/png;base64,AAA",
      "",
      "Squarespace suits design-led stores.",
      "Sold out on Shopify :) but available elsewhere.",
    ].join("\n");

    const stripped = stripDataUriImages(answer);

    expect(stripped).toContain("Squarespace suits design-led stores.");
    expect(stripped).toContain(
      "Sold out on Shopify :) but available elsewhere.",
    );
    expect(stripped).toBe(answer);
  });

  it("still strips a terminated image that appears after an unterminated one", () => {
    const answer = [
      "![](data:image/png;base64,BROKEN",
      "Real prose here.",
      "Tail ![](data:image/png;base64,AAAA) end.",
    ].join("\n");

    expect(stripDataUriImages(answer)).toBe(
      [
        "![](data:image/png;base64,BROKEN",
        "Real prose here.",
        "Tail end.",
      ].join("\n"),
    );
  });

  it("leaves a uri containing literal parentheses alone", () => {
    // Supporting nested parentheses is what made this function repeatedly
    // unsafe: it forced a depth scan, whose failure mode is running past an
    // unterminated uri into the prose. No observed Bright Data payload
    // contains one — production favicons are base64 — so an image whose uri is
    // not made of data-uri characters is simply not recognised and stays put.
    const answer =
      "Hi ![](data:image/svg+xml,%3Csvg%20fill=rgb(1,2,3)%20/%3E) there";

    expect(stripDataUriImages(answer)).toBe(answer);
  });

  it("closes the seam it opens without reflowing the rest", () => {
    const favicon = "![](data:image/png;base64,iVBORw0KGgo)";

    // An image alone between blank lines leaves one blank line, not two.
    expect(stripDataUriImages(`Intro.\n\n${favicon}\n\nTail.`)).toBe(
      "Intro.\n\nTail.",
    );
    // At the end of a line or the answer, the spacing before it goes too.
    expect(stripDataUriImages(`A pick. ${favicon}`)).toBe("A pick.");
    expect(stripDataUriImages(`A pick. ${favicon}\nNext.`)).toBe(
      "A pick.\nNext.",
    );
    // Mid-line, exactly one side's spacing goes, so words never join.
    expect(stripDataUriImages(`fill${favicon}${favicon} tail`)).toBe(
      "fill tail",
    );
  });

  it("stays linear on prose interleaved with favicons", () => {
    // The shape production actually sends. Seam decisions that re-scanned the
    // accumulated output made this quadratic: 1.1 MB took 11 seconds. The
    // other linearity tests miss it because their inputs never match, so the
    // loop body never runs.
    const unit = `${"word ".repeat(20)}![](data:image/png;base64,iVBORw0KGgo)\n`;
    const input = unit.repeat(Math.floor((4 * 1024 * 1024) / unit.length));

    expect(stripDataUriImages(input)).not.toContain("data:");
  });

  it("does not leave the whitespace around a leading or trailing favicon", () => {
    const favicon = "![](data:image/png;base64,iVBORw0KGgo)";

    expect(stripDataUriImages(`${favicon}\n\nHello.`)).toBe("Hello.");
    expect(stripDataUriImages(`Body text.\n\n${favicon}`)).toBe("Body text.");
    expect(stripDataUriImages(`A ${favicon}   \n\nB`)).toBe("A\n\nB");
  });

  it("leaves a newline run that sits wholly on one side of the removal", () => {
    // Those newlines were not created by removing the image, so reducing them
    // would be the document-wide reflow this function must not do.
    const favicon = "![](data:image/png;base64,iVBORw0KGgo)";

    expect(stripDataUriImages(`x${favicon}\n\n\n\ny`)).toBe("x\n\n\n\ny");
  });

  it("never loses a non-whitespace character that was not part of an image", () => {
    // The invariant every regression in this function has broken: prose is the
    // audit record and must survive verbatim. Whitespace is exempt because
    // closing a seam is allowed to change it.
    let seed = 0x9e3779b9;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const pick = <T>(values: T[]) =>
      values[Math.floor(random() * values.length)]!;
    const fragments = [
      "Squarespace ",
      "Shopify :) ",
      "\n",
      "\n\n",
      "  ",
      "![](data:image/png;base64,iVBORw0KGgo)",
      "![](data:image/png;base64,TRUNCATED",
      "![](data:image/svg+xml,%3Csvg(fill)",
      "![alt](https://example.com/a.png)",
      "rgb(1,2,3)",
      "](",
      "![",
      "text.",
    ];
    const withoutWhitespace = (value: string) => value.replace(/\s+/g, "");
    const imagePattern =
      /!\[[^\]\n]{0,256}\]\([ \t]{0,4}data:[A-Za-z0-9+/=;:,._%-]{0,2000000}\)/g;

    for (let attempt = 0; attempt < 400; attempt += 1) {
      const input = Array.from({ length: 12 }, () => pick(fragments)).join("");
      const expected = withoutWhitespace(input.replace(imagePattern, ""));

      expect(withoutWhitespace(stripDataUriImages(input))).toBe(expected);
    }
  });

  it("strips favicons that sit directly against each other", () => {
    // The production Google AI Mode shape: several favicons emitted adjacently
    // with no whitespace between them.
    const favicon = "![](data:image/png;base64,iVBORw0KGgo)";
    const answer = `Squarespace leads. ${favicon}${favicon}${favicon} Shopify follows.`;

    expect(stripDataUriImages(answer)).toBe(
      "Squarespace leads. Shopify follows.",
    );
  });

  it("leaves a mid-line unterminated data uri and the prose after it", () => {
    // The same failure one line narrower: the image is emitted inline with
    // prose after it, and a smiley later on the same line closes a parenthesis
    // it never opened.
    const answer =
      "Squarespace ![](data:image/png;base64,AAA is a strong pick :) Shopify scales further.";

    expect(stripDataUriImages(answer)).toBe(answer);
  });

  it("stays linear when one line holds many malformed image starts", () => {
    // Each failing scan used to run to the end of the line, so this input took
    // 80 seconds of synchronous CPU in the worker. Anything quadratic here
    // blows the 5s test timeout long before it finishes.
    const line =
      "x".repeat(20) +
      "![](data:image/png;base64,AAA".repeat(Math.floor((720 * 1024) / 29));

    expect(stripDataUriImages(line)).toBe(line);
  });

  it("stays linear when the malformed run contains unbalanced parentheses", () => {
    // The earlier guard only skipped a run when the failed scan saw no ")" at
    // all, so this shape — the url-encoded-SVG one — still rescanned to the end
    // for every start. It scaled 4x per doubling: 62 KB took 126ms, 248 KB
    // 1.87s, extrapolating to ~16s here.
    const line = "![](data:image/png;base64,a(b)c".repeat(
      Math.floor((720 * 1024) / 31),
    );

    expect(stripDataUriImages(line)).toBe(line);
  });

  it("returns an answer with no data uri byte-identical", () => {
    // Collapsing blank lines ran unconditionally, so answers this function
    // never touched were still rewritten.
    const answer = [
      "# Findings",
      "",
      "",
      "",
      "Squarespace suits design-led stores.",
      "",
      "    indented code block",
      "",
      "",
      "Trailing note.  ",
    ].join("\n");

    expect(stripDataUriImages(answer)).toBe(answer);
  });

  it("declines to strip an image whose uri is followed by a markdown title", () => {
    // Whitespace ends the URL in markdown, so the title makes this ambiguous.
    // Leaving it is the safe outcome.
    const answer = 'See ![](data:image/png;base64,AAAA "Logo") here.';

    expect(stripDataUriImages(answer)).toBe(answer);
  });
});

describe("scraper answer selection", () => {
  it("falls through an empty markdown field to the plain answer text", async () => {
    const { createBrightDataProvider } = await import("./providers/brightdata");
    const provider = createBrightDataProvider({
      BRIGHTDATA_API_KEY: "key",
    } as NodeJS.ProcessEnv);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { answer_text_markdown: "   ", answer_text: "The real answer." },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider.run("best ecommerce platform", {
      model: "gemini",
    });

    expect(result.answer).toBe("The real answer.");
    vi.unstubAllGlobals();
  });
});

describe("describeSurface", () => {
  it("keeps Google AI Mode distinct from Google AI Overview", () => {
    expect(describeSurface("brightdata", "google-ai-mode").label).toBe(
      "Google AI Mode",
    );
    expect(describeSurface("brightdata", "google-ai-overview").label).toBe(
      "Google AI Overview",
    );
  });
});
