import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { generateToken } from "../services/token.service.js";
import { CommonErrorResponses, ErrorResponse } from "./_schemas.js";

function rejectIfApiToken(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user.apiTokenId !== null) {
    reply.status(403).send({
      error: {
        code: "API_TOKEN_FORBIDDEN",
        message: "API tokens cannot manage other API tokens",
      },
    });
    return true;
  }
  return false;
}

const CreateTokenBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  scopes: Type.Array(Type.String(), { minItems: 1 }),
  expiresAt: Type.Optional(Type.String({ format: "date-time" })),
  integration: Type.Optional(Type.Boolean()),
});

const CreateTokenResponse = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    token: Type.String({ description: "Plaintext token — returned once only." }),
    integration: Type.Boolean(),
    scopes: Type.Array(Type.String()),
    expiresAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const TokenSummary = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    integration: Type.Boolean(),
    scopes: Type.Array(Type.String()),
    expiresAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    revokedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    lastUsedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const ScopeItem = Type.Object(
  {
    key: Type.String(),
    description: Type.String(),
  },
  { additionalProperties: true }
);

export async function apiTokenRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/scopes",
    {
      schema: {
        summary: "List available API token scopes",
        description:
          "Returns the catalog of scopes that can be granted when minting an API token.",
        tags: ["api-tokens"],
        response: {
          200: Type.Object(
            { data: Type.Array(ScopeItem) },
            { additionalProperties: true }
          ),
          401: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async () => {
      const scopes = await prisma.scope.findMany({ orderBy: { key: "asc" } });
      return {
        data: scopes.map((s) => ({ key: s.key, description: s.description })),
      };
    }
  );

  fastify.post<{ Body: Static<typeof CreateTokenBody> }>(
    "/api/v1/auth/tokens",
    {
      schema: {
        summary: "Create an API token",
        description:
          "Mints a new API token for the authenticated user. The plaintext token is returned once and never again — store it securely. Only JWT sessions may create tokens.",
        tags: ["api-tokens"],
        body: CreateTokenBody,
        response: {
          201: CreateTokenResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (rejectIfApiToken(request, reply)) return;

      const { name, scopes, expiresAt, integration } = request.body;

      const scopeRows = await prisma.scope.findMany({ where: { key: { in: scopes } } });
      const foundKeys = new Set(scopeRows.map((s) => s.key));
      const unknown = scopes.filter((k) => !foundKeys.has(k));
      if (unknown.length > 0) {
        return reply.status(400).send({
          error: { code: "UNKNOWN_SCOPE", message: `Unknown scope(s): ${unknown.join(", ")}` },
        });
      }

      const { plaintext, hash } = generateToken();
      const created = await prisma.apiToken.create({
        data: {
          orgId: request.org.id,
          userId: request.user.id,
          tokenHash: hash,
          name: name.trim(),
          integration: integration === true,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          scopes: { create: scopeRows.map((s) => ({ scopeId: s.id })) },
        },
        include: { scopes: { include: { scope: true } } },
      });

      return reply.status(201).send({
        id: created.id,
        name: created.name,
        token: plaintext,
        integration: created.integration,
        scopes: created.scopes.map((s) => s.scope.key),
        expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
        createdAt: created.createdAt.toISOString(),
      });
    }
  );

  fastify.get(
    "/api/v1/auth/tokens",
    {
      schema: {
        summary: "List the authenticated user's API tokens",
        description: "Returns token metadata (name, scopes, timestamps). Plaintext is never returned.",
        tags: ["api-tokens"],
        response: {
          200: Type.Object(
            { data: Type.Array(TokenSummary) },
            { additionalProperties: true }
          ),
          401: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request) => {
      const tokens = await prisma.apiToken.findMany({
        where: { userId: request.user.id, orgId: request.org.id },
        include: { scopes: { include: { scope: true } } },
        orderBy: { createdAt: "desc" },
      });

      return {
        data: tokens.map((t) => ({
          id: t.id,
          name: t.name,
          integration: t.integration,
          scopes: t.scopes.map((s) => s.scope.key),
          expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
          revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
          lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
        })),
      };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/auth/tokens/:id",
    {
      schema: {
        summary: "Revoke an API token",
        description: "Sets revokedAt on the token. Idempotent — revoking an already-revoked token returns 204.",
        tags: ["api-tokens"],
        params: Type.Object({ id: Type.String({ format: "uuid" }) }),
        response: {
          204: Type.Null(),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (rejectIfApiToken(request, reply)) return;

      const { id } = request.params;
      const token = await prisma.apiToken.findFirst({
        where: { id, userId: request.user.id, orgId: request.org.id },
      });
      if (!token) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Token not found" },
        });
      }

      if (!token.revokedAt) {
        await prisma.apiToken.update({
          where: { id },
          data: { revokedAt: new Date() },
        });
      }

      return reply.status(204).send();
    }
  );
}
