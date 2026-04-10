import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../prisma-client.js";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "../services/google-oauth.service.js";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/auth/callback", async (request, reply) => {
    const { code, redirectUri } = request.body as {
      code?: string;
      redirectUri?: string;
    };

    if (!code) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Authorization code required" },
      });
    }

    const resolvedRedirectUri = redirectUri || "http://localhost:5173/login";

    const tokens = await exchangeCodeForTokens(code, resolvedRedirectUri);
    const googleUser = await fetchGoogleUserInfo(tokens.access_token);

    // Upsert user by OAuth connection
    let oauthConnection = await prisma.oauthConnection.findUnique({
      where: {
        provider_providerUserId: {
          provider: "google",
          providerUserId: googleUser.sub,
        },
      },
      include: { user: true },
    });

    let userId: string;

    if (oauthConnection) {
      userId = oauthConnection.userId;
      await prisma.oauthConnection.update({
        where: { id: oauthConnection.id },
        data: { lastUsedAt: new Date() },
      });
    } else {
      // Check if a user with this email already exists
      const existingUser = googleUser.email
        ? await prisma.user.findUnique({ where: { email: googleUser.email } })
        : null;

      if (existingUser) {
        userId = existingUser.id;
        await prisma.oauthConnection.create({
          data: {
            userId: existingUser.id,
            provider: "google",
            providerUserId: googleUser.sub,
            lastUsedAt: new Date(),
          },
        });
      } else {
        const newUser = await prisma.user.create({
          data: {
            email: googleUser.email,
            displayName: googleUser.name,
            actorType: "human",
            status: "active",
            oauthConnections: {
              create: {
                provider: "google",
                providerUserId: googleUser.sub,
                lastUsedAt: new Date(),
              },
            },
          },
        });
        userId = newUser.id;
      }
    }

    const accessToken = jwt.sign(
      { sub: userId, type: "access" },
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpiresIn }
    );

    const refreshToken = jwt.sign(
      { sub: userId, type: "refresh" },
      config.jwtRefreshSecret,
      { expiresIn: config.jwtRefreshExpiresIn }
    );

    return { accessToken, refreshToken };
  });

  fastify.post("/api/v1/auth/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };

    if (!refreshToken) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Refresh token required" },
      });
    }

    try {
      const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as jwt.JwtPayload;

      if (payload.type !== "refresh") {
        return reply.status(401).send({
          error: { code: "UNAUTHORIZED", message: "Invalid token type" },
        });
      }

      const accessToken = jwt.sign(
        { sub: payload.sub, type: "access" },
        config.jwtSecret,
        { expiresIn: config.jwtAccessExpiresIn }
      );

      return { accessToken };
    } catch {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired refresh token" },
      });
    }
  });
}
