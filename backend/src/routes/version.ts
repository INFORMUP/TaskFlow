import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readNearestPackageJson(start: string): { version: string } {
  let dir = start;
  while (true) {
    try {
      return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error("package.json not found from " + start);
      }
      dir = parent;
    }
  }
}

const pkg = readNearestPackageJson(dirname(fileURLToPath(import.meta.url)));

export const APP_VERSION = pkg.version;

export async function versionRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/version",
    {
      schema: {
        summary: "Application version",
        tags: ["health"],
        security: [],
        response: {
          200: Type.Object({ version: Type.String() }),
        },
      },
    },
    async () => {
      return { version: APP_VERSION };
    }
  );
}
