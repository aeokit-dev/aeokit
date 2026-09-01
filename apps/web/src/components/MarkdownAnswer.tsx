import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function isGoogleFavicon(src: string | undefined): boolean {
  if (!src) return false;
  try {
    const url = new URL(src);
    return (
      (url.hostname === "google.com" || url.hostname === "www.google.com") &&
      url.pathname === "/s2/favicons"
    );
  } catch {
    return false;
  }
}

function MarkdownImage({
  node: _node,
  src,
  alt,
  ...props
}: ComponentProps<"img"> & { node?: unknown }) {
  if (isGoogleFavicon(src)) {
    return (
      <img
        {...props}
        src={src}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="markdown-favicon"
      />
    );
  }

  return (
    <img
      {...props}
      src={src}
      alt={alt || "Embedded image"}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="markdown-image"
    />
  );
}

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
  img: MarkdownImage,
  table: ({ node: _node, ...props }) => (
    <table {...props} className="table table-sm" />
  ),
};

export function MarkdownAnswer({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={markdownComponents}
    >
      {children}
    </ReactMarkdown>
  );
}
