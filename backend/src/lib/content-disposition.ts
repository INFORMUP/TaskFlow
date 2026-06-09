import contentDisposition from "content-disposition";

export type DispositionType = "inline" | "attachment";

/**
 * Build a header-safe `Content-Disposition` value for a stored file.
 *
 * User-supplied filenames routinely contain characters that are illegal in an
 * HTTP header value — e.g. the U+202F narrow no-break space macOS puts in
 * screenshot names ("Screenshot … 12.45.42 PM.png"). Interpolating such a
 * name straight into `filename="…"` makes Fastify reject the header and return
 * a 500. RFC 6266 / RFC 5987 require a us-ascii `filename` fallback plus a
 * percent-encoded `filename*` for the real UTF-8 name; the `content-disposition`
 * package (the same one Express and @fastify/static use) does that encoding.
 *
 * Always build the header through this helper instead of hand-rolling the
 * string, so the encoding lives in one tested place and can't regress per-route.
 */
export function fileContentDisposition(filename: string, type: DispositionType): string {
  return contentDisposition(filename, { type });
}
