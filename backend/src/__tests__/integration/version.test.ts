import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildApp } from "../helpers/app.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "../../../package.json"), "utf8")
) as { version: string };

describe("GET /version", () => {
  it("returns the version from package.json", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/version" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: pkg.version });
  });
});
