import { describe, it, expect } from "vitest";
import { buildApp } from "../helpers/app.js";

describe("GET /health", () => {
  it("returns status ok", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns application/json content type", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });
});
