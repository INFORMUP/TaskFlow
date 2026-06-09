import { describe, it, expect } from "vitest";
import { fileContentDisposition } from "../../lib/content-disposition.js";

describe("fileContentDisposition", () => {
  it("uses the requested disposition type", () => {
    expect(fileContentDisposition("page.html", "attachment")).toMatch(/^attachment;/);
    expect(fileContentDisposition("page.html", "inline")).toMatch(/^inline;/);
  });

  it("keeps a plain ASCII filename in the quoted filename parameter", () => {
    const value = fileContentDisposition("page.html", "inline");
    expect(value).toContain('filename="page.html"');
  });

  it("does not throw on a filename with a U+202F narrow no-break space", () => {
    // Real-world macOS screenshot name that previously 500'd the download route.
    const name = "Screenshot 2026-06-04 at 12.45.42 PM.png";
    expect(() => fileContentDisposition(name, "inline")).not.toThrow();
  });

  it("RFC 5987-encodes non-ASCII characters in the filename* parameter", () => {
    const name = "Screenshot 2026-06-04 at 12.45.42 PM.png";
    const value = fileContentDisposition(name, "inline");
    // U+202F encodes to %E2%80%AF in UTF-8.
    expect(value).toContain("filename*=UTF-8''");
    expect(value).toContain("%E2%80%AF");
  });

  it("produces a header value that is safe to send (Latin-1, no control chars)", () => {
    // HTTP header values are ISO-8859-1: code points > 0xFF (the U+202F that
    // caused the 500, emoji) must be percent-encoded into filename*; control
    // chars must never appear raw. Latin-1 chars (é) may stay verbatim.
    const nasties = [
      "Screenshot 2026-06-04 at 12.45.42 PM.png", // narrow no-break space
      "rocket 🚀.png", // emoji (surrogate pair)
      'quote".png', // embedded double-quote
      "tab\tnewline\n.png", // control characters
      "café résumé.png", // accented Latin
    ];
    for (const name of nasties) {
      const value = fileContentDisposition(name, "attachment");
      for (const ch of value) {
        const code = ch.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(0x20); // no control chars
        expect(code).toBeLessThanOrEqual(0xff); // representable as a Latin-1 header byte
      }
    }
  });
});
