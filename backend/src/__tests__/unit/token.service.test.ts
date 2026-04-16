import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  TOKEN_PREFIX,
} from "../../services/token.service.js";

describe("token.service", () => {
  describe("generateToken", () => {
    it("returns a plaintext starting with tf_", () => {
      const { plaintext } = generateToken();
      expect(plaintext.startsWith(TOKEN_PREFIX)).toBe(true);
    });

    it("returns distinct plaintexts on successive calls", () => {
      const a = generateToken().plaintext;
      const b = generateToken().plaintext;
      expect(a).not.toBe(b);
    });

    it("plaintext after prefix has sufficient entropy (≥ 32 chars)", () => {
      const { plaintext } = generateToken();
      const secret = plaintext.slice(TOKEN_PREFIX.length);
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });

    it("returned hash matches hashToken(plaintext)", () => {
      const { plaintext, hash } = generateToken();
      expect(hash).toBe(hashToken(plaintext));
    });

    it("hash does not contain the plaintext", () => {
      const { plaintext, hash } = generateToken();
      expect(hash.includes(plaintext)).toBe(false);
      expect(hash.includes(plaintext.slice(TOKEN_PREFIX.length))).toBe(false);
    });
  });

  describe("hashToken", () => {
    it("is deterministic for the same input", () => {
      const plaintext = "tf_example-secret-value-xyz";
      expect(hashToken(plaintext)).toBe(hashToken(plaintext));
    });

    it("produces different hashes for different inputs", () => {
      expect(hashToken("tf_a")).not.toBe(hashToken("tf_b"));
    });
  });
});
