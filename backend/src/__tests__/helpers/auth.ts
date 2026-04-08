import jwt from "jsonwebtoken";
import { config } from "../../config.js";

interface TestUser {
  id: string;
  email: string;
  displayName: string;
  actorType: string;
  teams: { id: string; slug: string }[];
}

export function mintTestToken(
  userId: string,
  options?: { expiresIn?: string }
): string {
  return jwt.sign(
    { sub: userId, type: "access" },
    config.jwtSecret,
    { expiresIn: options?.expiresIn ?? "1h" }
  );
}

export function mintExpiredToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: "access" },
    config.jwtSecret,
    { expiresIn: "0s" }
  );
}

export function mintRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: "refresh" },
    config.jwtRefreshSecret,
    { expiresIn: "7d" }
  );
}

export const TEST_ENGINEER_ID = "00000000-0000-0000-0000-000000000001";
export const TEST_PRODUCT_ID = "00000000-0000-0000-0000-000000000002";
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000003";
export const TEST_AGENT_ID = "00000000-0000-0000-0000-000000000004";
