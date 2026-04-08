import { describe, it, expect } from "vitest";
import { seedUuid } from "../../../prisma/seeders/common.js";

describe("seedUuid", () => {
  it("produces deterministic UUIDs for the same input", () => {
    const a = seedUuid("team", "engineer");
    const b = seedUuid("team", "engineer");
    expect(a).toBe(b);
  });

  it("produces different UUIDs for different inputs", () => {
    const a = seedUuid("team", "engineer");
    const b = seedUuid("team", "product");
    expect(a).not.toBe(b);
  });

  it("produces different UUIDs for different entities with same key", () => {
    const a = seedUuid("team", "name");
    const b = seedUuid("flow", "name");
    expect(a).not.toBe(b);
  });

  it("produces valid UUID format", () => {
    const id = seedUuid("team", "engineer");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
