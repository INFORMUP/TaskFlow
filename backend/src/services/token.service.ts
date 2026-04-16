import { randomBytes, createHmac } from "crypto";
import { config } from "../config.js";

export const TOKEN_PREFIX = "tf_";
const SECRET_BYTES = 32;

export function generateToken(): { plaintext: string; hash: string } {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${secret}`;
  return { plaintext, hash: hashToken(plaintext) };
}

export function hashToken(plaintext: string): string {
  return createHmac("sha256", config.tokenHashSecret).update(plaintext).digest("hex");
}
