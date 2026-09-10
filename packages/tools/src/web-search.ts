/**
 * web_search — DuckDuckGo HTML search, no API key (pattern ported from the
 * pixelspacev3 skill) with Wikipedia fallback.
 */

const DEFAULT_MAX_RESULTS = 8;
const MAX_MAX_RESULTS = 20;

function fetchText(
  url: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ status: number; body: string; error: string | null }> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let size = 0;
    let chunks: string[] = [];
    fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0" },
    })
      .then(async (res) => {
        const status = res.status;
        const reader = res.body?.getReader();
        if (!reader) return resolve({ status, body: "", error: null });
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const decoded = decoder.decode(value, { stream: true });
          size += decoded.length;
          if (size <= maxBytes) chunks.push(decoded);
          else {
            chunks.push(decoded.slice(0, maxBytes - (size - decoded.length)));
            await reader.cancel();
            break;
          }
        }
        clearTimeout(timer);
        resolve({ status, body: chunks.join(""), error: null });
      })
      .catch((e) => {
        clearTimeout(timer);
        resolve({ status: 0, body: "", error: e instanceof Error ? e.message : String(e) });
      });
  });
}

export function cleanUrl(raw: string): string {
  const m = raw.match(/uddg=([^&"]+)/);
  if (m) {
    try {
      const decoded = decodeURIComponent(m[1] ?? "");
      return decoded;
    } catch {
      // fall through
    }
  }
  return raw.replace(/^\/\//, "https://");
}

export function cleanQuery(q: string): string {
  const stop =
    /^(?:search\s+(?:the\s+)?(?:web|internet)(?:\s+(?:for|about))?|search\s+for|tell\s+me\s+(?:about|what|who)|what\s+is|who\s+is|who|what|give\s+me|find|look\s+up|about|info\s+(?:on|about)|information\s+(?:on|about)|on\b|the\b)\s*/i;
  let out = q;
  let prev: string;
  do {
    prev = out;
    out = out.replace(stop, "").trim();
  } while (out !== prev);
  return out || q;
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'");
}

export interface WebSearchResult {
  title: string;
  url: string;
}

export interface WebSearchOptions {
  maxResults?: number;
  timeoutMs?: number;
}

export async function webSearch(query: string, opts: WebSearchOptions = {}): Promise<string> {
  const count = Math.min(
    MAX_MAX_RESULTS,
    Math.max(1, Math.floor(opts.maxResults ?? DEFAULT_MAX_RESULTS)),
  );
  const timeout = opts.timeoutMs ?? 12_000;

  const res = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    timeout,
    2_000_000,
  );

  if (res.body && res.status === 200) {
    const results: WebSearchResult[] = [];
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.body)) && results.length < count) {
      const title = decodeHtml(m[2]!.replace(/<[^>]+>/g, "")).trim();
      results.push({ title, url: cleanUrl(m[1]!) });
    }
    if (results.length) {
      return (
        `Search results for "${query}" (via DuckDuckGo):\n` +
        results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n")
      );
    }
  }

  // DuckDuckGo returned a challenge page or nothing — fall back to Wikipedia.
  const wiki = await fetchText(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      cleanQuery(query),
    )}&limit=${count}&format=json`,
    10_000,
    200_000,
  );
  if (wiki.error || wiki.status !== 200) return `no results for "${query}"`;
  try {
    const [, titles, , urls] = JSON.parse(wiki.body) as [string, string[], unknown[], string[]];
    if (!titles || !titles.length) return `no results for "${query}"`;
    return (
      `Search results for "${query}" (via Wikipedia):\n` +
      titles.map((t, i) => `${i + 1}. ${t}\n   ${urls[i] || ""}`).join("\n")
    );
  } catch {
    return `no results for "${query}"`;
  }
}
