import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownAnswer } from "./MarkdownAnswer";

describe("MarkdownAnswer", () => {
  it("renders Bright Data Google favicons as bounded inline icons", () => {
    const html = renderToStaticMarkup(
      <MarkdownAnswer>
        {
          "M![](https://www.google.com/s2/favicons?domain=https%3A%2F%2Fmacspotter.com&sz=128) macspotter.com"
        }
      </MarkdownAnswer>,
    );

    expect(html).toContain('class="markdown-favicon"');
    expect(html).toContain('width="16"');
    expect(html).toContain('height="16"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });

  it("constrains normal Markdown images and ignores raw HTML", () => {
    const html = renderToStaticMarkup(
      <MarkdownAnswer>
        {
          '![Chart](https://example.com/chart.png)\n\n<img src="https://example.com/untrusted.png">'
        }
      </MarkdownAnswer>,
    );

    expect(html).toContain('class="markdown-image"');
    expect(html).toContain('alt="Chart"');
    expect(html).not.toContain("untrusted.png");
  });
});
