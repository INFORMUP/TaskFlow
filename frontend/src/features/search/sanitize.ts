// Sanitize a server-rendered ts_headline snippet down to text + <mark> tags
// only. Everything else is escaped — defense in depth in case description text
// ever contains user-supplied HTML that survived round-trip into the index.
export function sanitizeSnippet(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}
