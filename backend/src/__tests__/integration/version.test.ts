import { describe, it, expect } from "vitest";
import { buildApp } from "../helpers/app.js";
import { APP_VERSION } from "../../routes/version.js";

describe("GET /version", () => {
  it("returns the version from package.json", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/version" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: APP_VERSION });
  });

  it("is reachable without authentication", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/version" });

    expect(response.statusCode).not.toBe(401);
  });
});
