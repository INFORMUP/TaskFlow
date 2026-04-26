import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { config } from "../config.js";
import { ErrorResponse } from "./_schemas.js";
import {
  handlePullRequestEvent,
  type GithubPullRequestPayload,
} from "../services/github-webhook.service.js";

const WebhookOk = Type.Object({
  ok: Type.Literal(true),
  ignored: Type.Optional(Type.Boolean()),
  updated: Type.Optional(Type.Integer()),
});

function verifySignature(secret: string, raw: Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function githubWebhookRoutes(fastify: FastifyInstance) {
  // Encapsulated raw-body parser — scoped to this plugin so other routes
  // continue to receive parsed JSON.
  fastify.removeContentTypeParser("application/json");
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        const text = (body as Buffer).toString("utf8");
        const json = text.length === 0 ? null : JSON.parse(text);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  fastify.post(
    "/api/v1/webhooks/github",
    {
      schema: {
        summary: "GitHub webhook receiver",
        description:
          "Receives GitHub webhook deliveries. Signature is verified via X-Hub-Signature-256.",
        tags: ["webhooks"],
        security: [],
        response: {
          200: WebhookOk,
          401: ErrorResponse,
          503: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const secret = config.githubWebhookSecret;
      if (!secret) {
        return reply.status(503).send({
          error: {
            code: "WEBHOOK_NOT_CONFIGURED",
            message: "GITHUB_WEBHOOK_SECRET is not configured",
          },
        });
      }

      const raw = (request as unknown as { rawBody?: Buffer }).rawBody;
      const sig = request.headers["x-hub-signature-256"];
      const sigHeader = Array.isArray(sig) ? sig[0] : sig;
      if (!raw || !verifySignature(secret, raw, sigHeader)) {
        return reply.status(401).send({
          error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature" },
        });
      }

      const eventHeader = request.headers["x-github-event"];
      const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader;
      if (event !== "pull_request") {
        return reply.status(200).send({ ok: true, ignored: true });
      }

      const payload = request.body as GithubPullRequestPayload | null;
      if (!payload || !payload.pull_request || !payload.repository?.owner) {
        return reply.status(200).send({ ok: true, ignored: true });
      }

      const result = await handlePullRequestEvent(payload);
      return reply.status(200).send({
        ok: true,
        ignored: result.ignored,
        updated: result.updated,
      });
    },
  );
}
