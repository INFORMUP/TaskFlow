import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../prisma-client.js";
import { generateToken } from "../services/token.service.js";

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

export async function apiTokenRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/auth/tokens", async (request, reply) => {
    if (rejectIfApiToken(request, reply)) return;

    const { name, scopes, expiresAt, integration } = request.body as {
      name?: string;
      scopes?: string[];
      expiresAt?: string;
      integration?: boolean;
    };

    if (!name || !name.trim()) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "name is required" },
      });
    }
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "At least one scope is required" },
      });
    }

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
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    });
  });

  fastify.get("/api/v1/auth/tokens", async (request) => {
    const tokens = await prisma.apiToken.findMany({
      where: { userId: request.user.id },
      include: { scopes: { include: { scope: true } } },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        integration: t.integration,
        scopes: t.scopes.map((s) => s.scope.key),
        expiresAt: t.expiresAt,
        revokedAt: t.revokedAt,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      })),
    };
  });

  fastify.delete("/api/v1/auth/tokens/:id", async (request, reply) => {
    if (rejectIfApiToken(request, reply)) return;

    const { id } = request.params as { id: string };
    const token = await prisma.apiToken.findFirst({
      where: { id, userId: request.user.id },
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
  });
}
