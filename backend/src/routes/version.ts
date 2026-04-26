import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "../../package.json"), "utf8")
) as { version: string };

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
