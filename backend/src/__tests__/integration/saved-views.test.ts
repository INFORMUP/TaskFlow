import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";

const prisma = new PrismaClient();

describe("saved views", () => {
  let engineerToken: string;
  let productToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
  });

  beforeEach(async () => {
    await prisma.savedView.deleteMany();
  });

  afterAll(async () => {
    await prisma.savedView.deleteMany();
    await prisma.$disconnect();
  });

  it("creates a saved view", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        name: "My open bugs",
        filters: { flow: "bug", assigneeUserId: "me" },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("My open bugs");
    expect(body.filters).toEqual({ flow: "bug", assigneeUserId: "me" });
    expect(body.id).toBeTruthy();
  });

  it("rejects duplicate name for same user", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Dup", filters: {} },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Dup", filters: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("DUPLICATE_NAME");
  });

  it("allows the same name for a different user", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Shared", filters: {} },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${productToken}` },
      payload: { name: "Shared", filters: {} },
    });
    expect(res.statusCode).toBe(201);
  });

  it("lists only the requesting user's saved views", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Eng one", filters: {} },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${productToken}` },
      payload: { name: "Prod one", filters: {} },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().data.map((v: any) => v.name);
    expect(names).toEqual(["Eng one"]);
  });

  it("renames a saved view (owner only)", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Old", filters: {} },
    });
    const id = created.json().id;

    const ok = await app.inject({
      method: "PATCH",
      url: `/api/v1/saved-views/${id}`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "New" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe("New");
  });

  it("returns 404 when patching another user's saved view", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Mine", filters: {} },
    });
    const id = created.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/saved-views/${id}`,
      headers: { authorization: `Bearer ${productToken}` },
      payload: { name: "Stolen" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("deletes a saved view", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "ToDelete", filters: {} },
    });
    const id = created.json().id;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/saved-views/${id}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list.json().data).toHaveLength(0);
  });

  it("returns 404 when deleting another user's saved view", async () => {
    const app = await buildApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/saved-views",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Mine", filters: {} },
    });
    const id = created.json().id;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/saved-views/${id}`,
      headers: { authorization: `Bearer ${productToken}` },
    });
    expect(del.statusCode).toBe(404);
  });
});
