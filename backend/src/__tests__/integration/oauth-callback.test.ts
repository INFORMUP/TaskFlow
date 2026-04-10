import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { buildApp } from "../helpers/app.js";
import { config } from "../../config.js";

vi.mock("../../services/google-oauth.service.js", () => ({
  exchangeCodeForTokens: vi.fn().mockResolvedValue({
    access_token: "google-access-token",
    id_token: "google-id-token",
    token_type: "Bearer",
  }),
  fetchGoogleUserInfo: vi.fn().mockResolvedValue({
    sub: "google-user-12345",
    email: "oauth-test@example.com",
    name: "OAuth Test User",
  }),
}));

const prisma = new PrismaClient();

describe("POST /api/v1/auth/callback", () => {
  beforeAll(async () => {
    // Clean up any leftover test data
    await prisma.oauthConnection.deleteMany({
      where: { providerUserId: "google-user-12345" },
    });
    await prisma.userTeam.deleteMany({
      where: { user: { email: "oauth-test@example.com" } },
    });
    await prisma.user.deleteMany({
      where: { email: "oauth-test@example.com" },
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.oauthConnection.deleteMany({
      where: { providerUserId: "google-user-12345" },
    });
    await prisma.userTeam.deleteMany({
      where: { user: { email: "oauth-test@example.com" } },
    });
    await prisma.user.deleteMany({
      where: { email: "oauth-test@example.com" },
    });
    await prisma.$disconnect();
  });

  it("returns 400 when code is missing", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/callback",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("creates a new user and returns tokens on first login", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/callback",
      payload: { code: "valid-auth-code", redirectUri: "http://localhost:5173/login" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();

    // Verify access token is valid
    const decoded = jwt.verify(body.accessToken, config.jwtSecret) as jwt.JwtPayload;
    expect(decoded.type).toBe("access");
    expect(decoded.sub).toBeDefined();

    // Verify user was created in DB
    const user = await prisma.user.findUnique({
      where: { email: "oauth-test@example.com" },
      include: { oauthConnections: true, teams: true },
    });
    expect(user).not.toBeNull();
    expect(user!.displayName).toBe("OAuth Test User");
    expect(user!.actorType).toBe("human");
    expect(user!.status).toBe("active");
    expect(user!.oauthConnections).toHaveLength(1);
    expect(user!.oauthConnections[0].provider).toBe("google");
    expect(user!.oauthConnections[0].providerUserId).toBe("google-user-12345");

    // New users start with no team memberships; frontend forces a team picker
    expect(user!.teams).toHaveLength(0);
  });

  it("returns tokens for existing user on subsequent login", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/callback",
      payload: { code: "valid-auth-code", redirectUri: "http://localhost:5173/login" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();

    // Should still be only one user with this email
    const count = await prisma.user.count({
      where: { email: "oauth-test@example.com" },
    });
    expect(count).toBe(1);
  });
});
