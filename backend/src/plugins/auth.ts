import fp from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../prisma-client.js";
import "../types/index.js";

export const authPlugin = fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("user", null);

  fastify.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const PUBLIC_ROUTES = ["/health", "/api/v1/auth/callback", "/api/v1/auth/refresh"];

    if (PUBLIC_ROUTES.some((route) => request.url.startsWith(route))) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw Object.assign(new Error("Missing or invalid authorization header"), {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    const token = authHeader.slice(7);

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw Object.assign(new Error("Invalid or expired token"), {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    if (payload.type !== "access") {
      throw Object.assign(new Error("Invalid token type"), {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    const userId = payload.sub;
    if (!userId) {
      throw Object.assign(new Error("Invalid token"), {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { teams: { include: { team: true } } },
    });

    if (!user || user.status !== "active") {
      throw Object.assign(new Error("User not found or inactive"), {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    request.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      actorType: user.actorType,
      teams: user.teams.map((ut) => ({ id: ut.team.id, slug: ut.team.slug })),
    };
  });
});
