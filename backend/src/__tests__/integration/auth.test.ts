import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  mintExpiredToken,
  mintRefreshToken,
  TEST_ENGINEER_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";

const prisma = new PrismaClient();

describe("auth", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("protected routes", () => {
    it("returns 401 without token", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: "Bearer invalid-token" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 401 with expired token", async () => {
      const app = await buildApp();
      const token = mintExpiredToken(TEST_ENGINEER_ID);
      // Wait a tick for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 200 with valid token", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID);
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("returns new access token with valid refresh token", async () => {
      const app = await buildApp();
      const refreshToken = mintRefreshToken(TEST_ENGINEER_ID);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.accessToken).toBeDefined();
      expect(typeof body.accessToken).toBe("string");
    });

    it("returns 401 with invalid refresh token", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: "invalid" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 401 when using access token as refresh token", async () => {
      const app = await buildApp();
      const accessToken = mintTestToken(TEST_ENGINEER_ID);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: accessToken },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
