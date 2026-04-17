import { describe, it, expect } from "vitest";
import { buildApp } from "../helpers/app.js";

describe("CORS preflight", () => {
  it("advertises PUT/PATCH/DELETE in Access-Control-Allow-Methods", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/users/me/teams",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    const allowedMethods = (response.headers["access-control-allow-methods"] as string) || "";
    const methods = allowedMethods.split(",").map((m) => m.trim().toUpperCase());
    expect(methods).toEqual(expect.arrayContaining(["GET", "POST", "PUT", "PATCH", "DELETE"]));
  });
});
