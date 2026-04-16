import fp from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../prisma-client.js";
import { TOKEN_PREFIX, hashToken } from "../services/token.service.js";
import type { AuthUser } from "../types/index.js";
import "../types/index.js";

function unauthorized(message: string): Error {
  return Object.assign(new Error(message), {
    statusCode: 401,
    code: "UNAUTHORIZED",
  });
}

async function authenticateApiToken(plaintext: string): Promise<AuthUser> {
  const tokenHash = hashToken(plaintext);
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: {
      user: { include: { teams: { include: { team: true } } } },
      scopes: { include: { scope: true } },
    },
  });

  if (!token) throw unauthorized("Invalid API token");
  if (token.revokedAt) throw unauthorized("API token has been revoked");
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) {
    throw unauthorized("API token has expired");
  }
  if (token.user.status !== "active") {
    throw unauthorized("Token owner is not active");
  }

  return {
    id: token.user.id,
    email: token.user.email,
    displayName: token.user.displayName,
    actorType: token.user.actorType,
    teams: token.user.teams.map((ut) => ({ id: ut.team.id, slug: ut.team.slug })),
    scopes: token.scopes.map((s) => s.scope.key),
    apiTokenId: token.id,
    integrationToken: token.integration,
  };
}

async function authenticateJwt(rawToken: string): Promise<AuthUser> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(rawToken, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw unauthorized("Invalid or expired token");
  }

  if (payload.type !== "access") throw unauthorized("Invalid token type");

  const userId = payload.sub;
  if (!userId) throw unauthorized("Invalid token");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { teams: { include: { team: true } } },
  });

  if (!user || user.status !== "active") {
    throw unauthorized("User not found or inactive");
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    actorType: user.actorType,
    teams: user.teams.map((ut) => ({ id: ut.team.id, slug: ut.team.slug })),
    scopes: null,
    apiTokenId: null,
    integrationToken: false,
  };
}

export const authPlugin = fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("user", undefined as unknown as AuthUser);

  fastify.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const PUBLIC_ROUTES = [
      "/health",
      "/api/v1/auth/callback",
      "/api/v1/auth/refresh",
      "/docs",
    ];

    if (PUBLIC_ROUTES.some((route) => request.url.startsWith(route))) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw unauthorized("Missing or invalid authorization header");
    }

    const rawToken = authHeader.slice(7);

    request.user = rawToken.startsWith(TOKEN_PREFIX)
      ? await authenticateApiToken(rawToken)
      : await authenticateJwt(rawToken);
  });
});
