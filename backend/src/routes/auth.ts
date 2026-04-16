import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { config } from "../config.js";
import { prisma } from "../prisma-client.js";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "../services/google-oauth.service.js";
import { CommonErrorResponses } from "./_schemas.js";

const CallbackBody = Type.Object({
  code: Type.String({ minLength: 1, description: "Authorization code returned by Google." }),
  redirectUri: Type.Optional(Type.String({ format: "uri" })),
});

const CallbackResponse = Type.Object(
  {
    accessToken: Type.String(),
    refreshToken: Type.String(),
  },
  { additionalProperties: true }
);

const RefreshBody = Type.Object({
  refreshToken: Type.String({ minLength: 1 }),
});

const RefreshResponse = Type.Object(
  { accessToken: Type.String() },
  { additionalProperties: true }
);

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: Static<typeof CallbackBody> }>(
    "/api/v1/auth/callback",
    {
      schema: {
        summary: "Exchange a Google OAuth code for a session",
        description:
          "Public endpoint. Upserts the user by OAuth connection (creating a user if needed) and returns a JWT access + refresh pair.",
        tags: ["auth"],
        security: [],
        body: CallbackBody,
        response: {
          200: CallbackResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request) => {
      const { code, redirectUri } = request.body;
      const resolvedRedirectUri = redirectUri || "http://localhost:5173/login";

      const tokens = await exchangeCodeForTokens(code, resolvedRedirectUri);
      const googleUser = await fetchGoogleUserInfo(tokens.access_token);

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
        { expiresIn: config.jwtAccessExpiresIn as StringValue }
      );

      const refreshToken = jwt.sign(
        { sub: userId, type: "refresh" },
        config.jwtRefreshSecret,
        { expiresIn: config.jwtRefreshExpiresIn as StringValue }
      );

      return { accessToken, refreshToken };
    }
  );

  fastify.post<{ Body: Static<typeof RefreshBody> }>(
    "/api/v1/auth/refresh",
    {
      schema: {
        summary: "Exchange a refresh token for a new access token",
        tags: ["auth"],
        security: [],
        body: RefreshBody,
        response: {
          200: RefreshResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

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
          { expiresIn: config.jwtAccessExpiresIn as StringValue }
        );

        return { accessToken };
      } catch {
        return reply.status(401).send({
          error: { code: "UNAUTHORIZED", message: "Invalid or expired refresh token" },
        });
      }
    }
  );
}
