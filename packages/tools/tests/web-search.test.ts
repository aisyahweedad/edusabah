import { describe, expect, it } from "vitest";
import { cleanQuery, cleanUrl, decodeHtml } from "../src/web-search.js";

describe("cleanQuery (Wikipedia fallback)", () => {
  it("strips question/instruction phrasing", () => {
    expect(cleanQuery("what is the capital of Sabah")).toBe("capital of Sabah");
    expect(cleanQuery("who is the minister")).toBe("minister");
    expect(cleanQuery("tell me about Batu Pahat")).toBe("Batu Pahat");
    expect(cleanQuery("search the web for malicious code")).toBe("malicious code");
    expect(cleanQuery("find Jawa Barat")).toBe("Jawa Barat");
  });

  it("returns the original query when nothing matches", () => {
    expect(cleanQuery("Sekolah Kebangsaan St Paul Sandakan")).toBe(
      "Sekolah Kebangsaan St Paul Sandakan",
    );
  });
});

describe("cleanUrl (DuckDuckGo redirect)", () => {
  it("decodes uddg redirects", () => {
    expect(
      cleanUrl(
        "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kpm.gov.my%2Fen%2Fhome",
      ),
    ).toBe("https://www.kpm.gov.my/en/home");
  });

  it("upgrades protocol-relative URLs", () => {
    expect(cleanUrl("//example.com/abc")).toBe("https://example.com/abc");
  });
});

describe("decodeHtml", () => {
  it("unescapes common HTML entities", () => {
    expect(decodeHtml("&#x27;Barack&#039;s&#39; &amp; &lt;x&gt;")).toBe("'Barack&#039;s' & <x>");
  });
});
