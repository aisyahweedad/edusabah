/**
 * fetch_url — port of the pixelspacev3 web-fetch skill: fetch one page, remove
 * chrome, return title + readable text (bounded).
 */

const DEFAULT_MAX_CHARS = 12_000;
const MAX_MAX_CHARS = 20_000;
const MAX_BODY_BYTES = 5_000_000;
const REQUEST_TIMEOUT_MS = 20_000;

const BLOCK_TAGS =
  /<\/?(?:address|article|aside|blockquote|div|dl|dt|dd|figcaption|figure|footer|h[1-6]|header|main|nav|ol|p|pre|section|table|tbody|thead|tfoot|tr|ul)\b[^>]*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  raquo: "»",
  rdquo: "”",
  rsquo: "’",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, (entity, key: string) => {
    if (key[0] === "#") {
      const hex = key[1]?.toLowerCase() === "x";
      const code = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return entity;
        }
      }
      return entity;
    }
    return NAMED_ENTITIES[key.toLowerCase()] ?? entity;
  });
}

function attribute(tag: string, name: string): string {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function metadata(html: string, wanted: string[]): string {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = attribute(tag, "name") || attribute(tag, "property");
    if (wanted.includes(key.toLowerCase())) return attribute(tag, "content");
  }
  return "";
}

function removePageChrome(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(?:script|style|noscript|svg|template|canvas|iframe)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|template|canvas|iframe)>/gi,
      " ",
    )
    .replace(
      /<(?:nav|header|footer|aside|form|dialog)\b[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside|form|dialog)>/gi,
      " ",
    );
}

export function markupToText(html: string): string {
  return decodeEntities(
    removePageChrome(html)
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/?(?:td|th)\b[^>]*>/gi, "\t")
      .replace(BLOCK_TAGS, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function jsonLdArticleBodies(html: string): string[] {
  const bodies: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.articleBody === "string") bodies.push(record.articleBody.trim());
    for (const child of Object.values(record)) {
      if (child && typeof child === "object") visit(child);
    }
  };
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]!.trim()));
    } catch {
      // malicious/non-JSON in the block; harmless to skip
    }
  }
  return bodies;
}

function tagBodies(html: string, tagName: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  for (const match of html.matchAll(pattern)) {
    const text = markupToText(match[1]!);
    if (text) blocks.push(text);
  }
  return blocks;
}

export function extractReadableHtml(html: string): { title: string; text: string } {
  const rawTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const title = markupToText(rawTitle) || metadata(html, ["og:title", "twitter:title"]);
  const description = metadata(html, ["description", "og:description", "twitter:description"]);
  const longest = (values: string[]) =>
    values.filter((text) => text.length >= 200).sort((a, b) => b.length - a.length)[0];
  let text =
    longest(jsonLdArticleBodies(html)) ??
    longest(tagBodies(html, "article")) ??
    longest(tagBodies(html, "main")) ??
    markupToText(html);
  if (description && !text.toLowerCase().includes(description.toLowerCase())) {
    text = `${description}\n\n${text}`;
  }
  return { title, text };
}

async function readBounded(response: Response, maxBytes = MAX_BODY_BYTES) {
  if (!response.body) return { body: "", truncated: false, bytes: 0 };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - bytes;
    if (value.byteLength > remaining) {
      body += decoder.decode(value.subarray(0, Math.max(0, remaining)), { stream: true });
      bytes = maxBytes;
      truncated = true;
      await reader.cancel();
      break;
    }
    bytes += value.byteLength;
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  return { body, truncated, bytes };
}

interface PageRequest {
  url: string;
  maxChars?: number;
}

export function renderPage(input: {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  body: string;
  bodyTruncated: boolean;
  maxChars: number;
}): string {
  const { requestedUrl, finalUrl, contentType, body, bodyTruncated, maxChars } = input;
  const html =
    /(?:text\/html|application\/xhtml\+xml)/i.test(contentType) ||
    /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body);

  let title = "";
  let text: string;
  if (html) {
    ({ title, text } = extractReadableHtml(body));
  } else if (/\b(?:application\/(?:[\w.+-]*\+)?json|text\/json)\b/i.test(contentType)) {
    try {
      text = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      text = body.trim();
    }
  } else if (/^text\//i.test(contentType) || !contentType) {
    text = body.trim();
  } else {
    return `error: fetch_url cannot read non-text content (${contentType || "unknown content type"})`;
  }

  if (!text) return "error: fetch_url found no readable text on the page";
  const totalChars = text.length;
  const shown = text.slice(0, maxChars).trimEnd();
  const header = [
    title ? `Title: ${title}` : null,
    `URL: ${finalUrl || requestedUrl}`,
    finalUrl && finalUrl !== requestedUrl ? `Requested URL: ${requestedUrl}` : null,
    `Content-Type: ${contentType || "unknown"}`,
    "----------------------------------------",
  ].filter(Boolean);
  const notes: string[] = [];
  if (totalChars > maxChars) {
    notes.push(
      `[Output truncated: showing ${shown.length.toLocaleString()} of ${totalChars.toLocaleString()} readable characters.]`,
    );
  }
  if (bodyTruncated) {
    notes.push(
      `[Download stopped at ${(MAX_BODY_BYTES / 1_000_000).toFixed(0)} MB before extraction.]`,
    );
  }
  return `${header.join("\n")}\n${shown}${notes.length ? `\n\n${notes.join("\n")}` : ""}`;
}

export async function fetchUrl(url: string, maxChars?: number): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "error: fetch_url needs an absolute HTTP(S) URL";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return "error: fetch_url needs an absolute HTTP(S) URL";
  }

  let requestedMax = Number(maxChars);
  if (!Number.isFinite(requestedMax)) requestedMax = DEFAULT_MAX_CHARS;
  const cap = Math.min(MAX_MAX_CHARS, Math.max(1_000, Math.floor(requestedMax)));

  let response: Response;
  try {
    response = await fetch(parsed.href, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.1",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `error: fetch_url request failed (${reason})`;
  }
  if (!response.ok) return `error: fetch_url returned HTTP ${response.status}`;

  let downloaded;
  try {
    downloaded = await readBounded(response);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `error: fetch_url could not read the response (${reason})`;
  }

  return renderPage({
    requestedUrl: parsed.href,
    finalUrl: response.url,
    contentType: response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "",
    body: downloaded.body,
    bodyTruncated: downloaded.truncated,
    maxChars: cap,
  });
}
