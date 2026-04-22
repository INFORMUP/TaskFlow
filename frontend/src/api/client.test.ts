import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiFetch } from "./client";

function jsonResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body: string, statusText = ""): Response {
  return new Response(body, {
    status,
    statusText,
    headers: { "Content-Type": "text/plain" },
  });
}

describe("apiFetch error normalization", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("rethrows canonical {error:{code,message}} unchanged and includes raw", async () => {
    const body = { error: { code: "VALIDATION_FAILED", message: "Name is required" } };
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(400, body, "Bad Request"));

    await expect(apiFetch("/api/v1/things")).rejects.toEqual({
      status: 400,
      error: { code: "VALIDATION_FAILED", message: "Name is required" },
      raw: body,
    });
  });

  it("normalizes Fastify default 404 body into canonical shape", async () => {
    const body = {
      message: "Route POST:/api/v1/organizations not found",
      error: "Not Found",
      statusCode: 404,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(404, body, "Not Found"));

    await expect(apiFetch("/api/v1/organizations", { method: "POST" })).rejects.toEqual({
      status: 404,
      error: {
        code: "HTTP_404",
        message: "Route POST:/api/v1/organizations not found",
      },
      raw: body,
    });
  });

  it("falls back to statusText when the response body isn't parseable JSON", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(textResponse(500, "<html>oops</html>", "Internal Server Error"));

    await expect(apiFetch("/api/v1/anything")).rejects.toEqual({
      status: 500,
      error: { code: "HTTP_500", message: "Internal Server Error" },
      raw: null,
    });
  });

  it("triggers refresh flow on 401 and retries the original request", async () => {
    localStorage.setItem("accessToken", "expired-token");
    localStorage.setItem("refreshToken", "refresh-token");

    const fetchMock = vi
      .fn()
      // first call: 401 on the target endpoint
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } }, "Unauthorized")
      )
      // refresh call: returns new access token
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "new-token" }))
      // retry of original request: success
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    globalThis.fetch = fetchMock;

    const result = await apiFetch<{ ok: boolean }>("/api/v1/me");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem("accessToken")).toBe("new-token");

    const retryCall = fetchMock.mock.calls[2];
    const retryHeaders = (retryCall[1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer new-token");

    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall[0]).toContain("/api/v1/auth/refresh");
  });
});
