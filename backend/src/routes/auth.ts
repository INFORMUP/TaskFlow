import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { config } from "../config.js";
import { DEFAULT_ORG_ID } from "../constants/org.js";
import { prisma } from "../prisma-client.js";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "../services/google-oauth.service.js";
import { CommonErrorResponses, ErrorResponse } from "./_schemas.js";

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

const SwitchOrgBody = Type.Object({
  orgId: Type.String({ format: "uuid" }),
});

const SwitchOrgResponse = Type.Object(
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
    async (request, reply) => {
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
          await prisma.orgMember.upsert({
            where: { orgId_userId: { orgId: DEFAULT_ORG_ID, userId } },
            update: {},
            create: { orgId: DEFAULT_ORG_ID, userId, role: "member" },
          });
        }
      }

      const membership = await prisma.orgMember.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      if (!membership) {
        return reply.status(403).send({
          error: { code: "NO_ORG", message: "User is not a member of any organization" },
        });
      }

      const accessToken = jwt.sign(
        { sub: userId, type: "access", orgId: membership.orgId, orgRole: membership.role },
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

        const membership = await prisma.orgMember.findFirst({
          where: { userId: payload.sub as string },
          orderBy: { createdAt: "asc" },
        });
        if (!membership) {
          return reply.status(403).send({
            error: { code: "NO_ORG", message: "User is not a member of any organization" },
          });
        }

        const accessToken = jwt.sign(
          { sub: payload.sub, type: "access", orgId: membership.orgId, orgRole: membership.role },
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

  fastify.post<{ Body: Static<typeof SwitchOrgBody> }>(
    "/api/v1/auth/switch-org",
    {
      schema: {
        summary: "Switch the active organization on an access token",
        description:
          "Issues a fresh access token carrying the requested org's `orgId` + `orgRole` claims. Caller must be a member of the target org. The refresh token is unchanged.",
        tags: ["auth"],
        body: SwitchOrgBody,
        response: {
          200: SwitchOrgResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { orgId } = request.body;
      const membership = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: request.user.id } },
      });
      if (!membership) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Not a member of the requested organization" },
        });
      }

      const accessToken = jwt.sign(
        {
          sub: request.user.id,
          type: "access",
          orgId: membership.orgId,
          orgRole: membership.role,
        },
        config.jwtSecret,
        { expiresIn: config.jwtAccessExpiresIn as StringValue }
      );

      return { accessToken };
    }
  );
}
