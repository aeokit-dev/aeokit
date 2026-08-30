import type { CitationResult } from "../types";

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isGoogleGotoUrl(value: URL): boolean {
  const hostname = value.hostname.replace(/^www\./, "").toLowerCase();
  return (
    hostname === "google.com" &&
    value.pathname === "/goto" &&
    value.searchParams.has("url")
  );
}

export async function resolveCitationUrl(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  let candidate: URL;
  try {
    candidate = new URL(url);
  } catch {
    return url;
  }
  if (!isGoogleGotoUrl(candidate)) return url;

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      ...(signal ? { signal } : {}),
    });
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) {
      return url;
    }
    const resolved = new URL(location, candidate);
    return resolved.protocol === "http:" || resolved.protocol === "https:"
      ? resolved.toString()
      : url;
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : error;
    }
    return url;
  }
}

/**
 * One inlined `data:` image.
 *
 * Every part is bounded and every character class excludes its own terminator,
 * so this cannot backtrack: the alt run stops at `]`, and the URI run excludes
 * `)` and whitespace. An earlier unbounded `[^\]\n]*` alt run took 57 seconds
 * on 512 KB of `![` with no `]`, which is scraper-supplied text.
 *
 * The URI class is the characters a data URI is made of — base64, the
 * mediatype punctuation, and percent-encoding. Anything else, including a
 * literal parenthesis or whitespace, means this is not an image this function
 * understands, so it does not match and the text is left alone. That is the
 * direction to err in: the stored answer is the audit record, and a stray
 * image in the text is cosmetic where removing the wrong span is not
 * recoverable.
 */
const dataUriImage =
  /!\[[^\]\n]{0,256}\]\([ \t]{0,4}(data:[A-Za-z0-9+/=;:,._%-]{0,2000000})\)/g;

/**
 * Bright Data's Google AI Mode markdown inlines each source favicon as a
 * base64 `data:` image. Observed in production, those images were 9,996 of a
 * 12,057-character answer — 83% of the stored text — and pushed that surface's
 * mean stored answer to 22 KB against ~3 KB everywhere else. They carry no
 * information the answer needs, so drop them before the answer is stored.
 *
 * An answer containing no such image comes back byte-identical, and an answer
 * that does contain one is edited only where the image was: no document-wide
 * reflow, because the prose either side of a favicon is the audit record too.
 */
/**
 * Replaces inlined images, and any other `data:` payload, with a separator.
 *
 * For readers that only want the prose — competitor extraction, say — rather
 * than a faithful stored answer. stripDataUriImages closes the seam it opens,
 * so `A <img> B` becomes `A B`; that is right for the archive but fuses the
 * two neighbours into one phrase for anything scanning for names. This keeps
 * them apart, and also catches a payload embedded some way other than markdown
 * — an HTML `<img src="data:…">`, for instance.
 */
export function redactDataUriPayloads(answer: string): string {
  return answer
    .replace(dataUriImage, "\n")
    .replace(/data:[A-Za-z0-9+/=;:,._%-]{16,}/g, "\n");
}

export function stripDataUriImages(answer: string): string {
  const parts: string[] = [];
  let cursor = 0;
  let stripped = 0;
  // Seam decisions read these instead of re-scanning the accumulated output.
  // Anchoring a regex to the end of a growing string costs a full scan each
  // time, which made this quadratic on the one shape production sends: prose
  // interleaved with favicons.
  let tailChar = "";
  let tailNewlines = 0;
  let tailSpaces = 0;

  const emit = (piece: string) => {
    if (piece === "") return;
    parts.push(piece);
    let index = piece.length;
    let newlines = 0;
    while (index > 0 && piece[index - 1] === "\n") {
      newlines += 1;
      index -= 1;
    }
    let spaces = 0;
    if (newlines === 0) {
      while (
        index > 0 &&
        (piece[index - 1] === " " || piece[index - 1] === "\t")
      ) {
        spaces += 1;
        index -= 1;
      }
    }
    // Only carry the previous tail when this piece was nothing but that run.
    tailNewlines =
      index === 0 && newlines > 0 ? tailNewlines + newlines : newlines;
    tailSpaces = index === 0 && spaces > 0 ? tailSpaces + spaces : spaces;
    tailChar = piece[piece.length - 1] ?? tailChar;
  };

  dataUriImage.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = dataUriImage.exec(answer)) !== null) {
    let pieceEnd = match.index;
    let next = dataUriImage.lastIndex;
    // Spaces between the image and the line break still leave it last on its
    // line, so look past them before deciding.
    let probe = next;
    while (answer[probe] === " " || answer[probe] === "\t") probe += 1;
    const atLineEnd = probe >= answer.length || answer.startsWith("\n", probe);

    // Close the seam the removal opens, and only that seam. Take one side's
    // spacing at most, or "a <img> b" would become "ab".
    if (atLineEnd) {
      // Nothing follows on the line, so neither side's spacing can join.
      next = probe;
      while (
        pieceEnd > cursor &&
        (answer[pieceEnd - 1] === " " || answer[pieceEnd - 1] === "\t")
      ) {
        pieceEnd -= 1;
      }
      if (pieceEnd === cursor && tailSpaces > 0) {
        const last = parts.pop() ?? "";
        emit(last.slice(0, last.length - tailSpaces));
      }
    } else {
      const leftChar = pieceEnd > cursor ? answer[pieceEnd - 1] : tailChar;
      if (leftChar === "" || leftChar === undefined || /\s/.test(leftChar)) {
        while (answer[next] === " " || answer[next] === "\t") next += 1;
      }
    }

    emit(answer.slice(cursor, pieceEnd));
    cursor = next;
    stripped += 1;

    // An image alone between blank lines leaves two blank lines where there
    // was one. Reduce that run only when it spans the removal — a run wholly
    // on one side was not created by it and is not ours to touch.
    let after = 0;
    while (answer.startsWith("\n", cursor + after)) after += 1;
    if (tailNewlines > 0 && after > 0 && tailNewlines + after > 2) {
      cursor += Math.min(after, tailNewlines + after - 2);
    }
  }

  if (stripped === 0) return answer;
  emit(answer.slice(cursor));
  // Removing an image at the very start or end leaves the whitespace that
  // surrounded it; the caller substitutes a placeholder for an empty answer.
  return parts.join("").trim();
}

export function dedupeCitations(
  citations: Array<Omit<CitationResult, "position">>,
): CitationResult[] {
  const seen = new Set<string>();
  const output: CitationResult[] = [];
  for (const citation of citations) {
    if (!citation.url.startsWith("http") || seen.has(citation.url)) continue;
    seen.add(citation.url);
    output.push({ ...citation, position: output.length });
  }
  return output;
}

export async function apiError(
  response: Response,
  provider: string,
): Promise<Error> {
  const body = await response.text();
  const summary = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  return new Error(
    `${provider} request failed (${response.status}): ${summary}`,
  );
}
