import { describe, it, expect } from "vitest";
import { sanitizeSnippet } from "./sanitize";

describe("sanitizeSnippet", () => {
  it("preserves <mark> tags from server-rendered ts_headline output", () => {
    const out = sanitizeSnippet("hello <mark>world</mark> foo");
    expect(out).toBe("hello <mark>world</mark> foo");
  });

  it("escapes script tags so they don't execute", () => {
    const out = sanitizeSnippet("<script>alert(1)</script>");
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("escapes other html tags but keeps mark", () => {
    const out = sanitizeSnippet("<img src=x> <mark>hit</mark> <b>bold</b>");
    expect(out).toContain("<mark>hit</mark>");
    expect(out).toContain("&lt;img");
    expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(out).not.toMatch(/<img/);
    expect(out).not.toMatch(/<b>/);
  });

  it("escapes ampersands first to prevent double-decoding", () => {
    const out = sanitizeSnippet("a & b &lt;mark&gt;");
    expect(out).toBe("a &amp; b &amp;lt;mark&amp;gt;");
  });
});
