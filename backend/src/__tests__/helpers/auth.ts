import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

export function mintTestToken(
  userId: string,
  options?: { expiresIn?: string; orgId?: string; orgRole?: string }
): string {
  return jwt.sign(
    {
      sub: userId,
      type: "access",
      orgId: options?.orgId ?? DEFAULT_ORG_ID,
      orgRole: options?.orgRole ?? "member",
    },
    config.jwtSecret,
    { expiresIn: options?.expiresIn ?? "1h" }
  );
}

export function mintExpiredToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: "access", orgId: DEFAULT_ORG_ID, orgRole: "member" },
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
