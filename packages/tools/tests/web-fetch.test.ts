import { describe, expect, it } from "vitest";
import {
  markupToText,
  extractReadableHtml,
  renderPage,
} from "../src/web-fetch.js";

describe("markupToText", () => {
  it("removes scripts, styles, and page chrome", () => {
    const html =
      "<html><head><style>body{color:red}</style><script>console.log(1)</script>" +
      '<nav><a href="/">Home</a></nav></head>' +
      '<body><article><h1>Hello</h1><p>World &amp; more</p></article></body></html>';
    const text = markupToText(html);
    expect(text).toContain("Hello");
    expect(text).toContain("World & more");
    expect(text).not.toContain("Home");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("console.log");
  });

  it("converts list items to bullets", () => {
    expect(markupToText("<ul><li>satu</li><li>dua</li></ul>")).toContain("- satu");
  });

  it("collapses whitespace runs", () => {
    expect(markupToText("<p>a     b</p>\n\n\n<p>c</p>")).toContain("a b\n\nc");
  });
});

describe("extractReadableHtml", () => {
  it("prefers the longest article block over chrome", () => {
    const html =
      '<html><head><title>Title Page</title><meta name="description" content="Desc here"></head>' +
      "<body><nav>NAVNAVNAVNAVNAVNAVNAV</nav>" +
      "<article>" +
      "Long paragraph that is over two hundred characters long so that it is " +
      "chosen by the longest-text heuristic instead of the smaller chrome " +
      "strips that appear elsewhere on this page body content." +
      "</article></body></html>";
    const { title, text } = extractReadableHtml(html);
    expect(title).toBe("Title Page");
    expect(text).toContain("chosen by the longest-text heuristic");
  });
});

describe("renderPage", () => {
  it("emits a header with title, URL, content type", () => {
    const out = renderPage({
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      contentType: "text/html",
      body: "<title>Ex</title><p>Hello world</p>",
      bodyTruncated: false,
      maxChars: 12_000,
    });
    expect(out).toContain("Title: Ex");
    expect(out).toContain("URL: https://example.com/");
    expect(out).toContain("Hello world");
  });

  it("flags truncated output and does not exceed maxChars", () => {
    const body = "<title>T</title>" + "<p>" + "x".repeat(5_000) + "</p>";
    const out = renderPage({
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      contentType: "text/html",
      body,
      bodyTruncated: false,
      maxChars: 1_000,
    });
    const noteIdx = out.indexOf("\n[Output truncated:");
    const textPart = out.slice(
      out.indexOf("----------------------------------------"),
      noteIdx === -1 ? out.length : noteIdx,
    );
    expect(textPart.slice(40).trim().length).toBeLessThanOrEqual(1_000);
    expect(out).toContain("[Output truncated:");
  });

  it("notes when the download was stopped early", () => {
    const out = renderPage({
      requestedUrl: "https://example.com/big",
      finalUrl: "https://example.com/big",
      contentType: "text/html",
      body: "<title>B</title><p>small</p>",
      bodyTruncated: true,
      maxChars: 12_000,
    });
    expect(out).toContain("Download stopped at 5 MB");
  });

  it("rejects non-text content types", () => {
    const out = renderPage({
      requestedUrl: "https://example.com/x.zip",
      finalUrl: "https://example.com/x.zip",
      contentType: "application/zip",
      body: "PK\u0003\u0004binary",
      bodyTruncated: false,
      maxChars: 12_000,
    });
    expect(out).toContain("cannot read non-text content");
  });
});
