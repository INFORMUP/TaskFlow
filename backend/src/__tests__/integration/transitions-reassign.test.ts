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

describe("transition with reassign", () => {
  let engineerToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.$disconnect();
  });

  it("reassigns task and records newAssigneeId on the transition", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Reassign me",
        priority: "medium",
        assigneeUserId: TEST_ENGINEER_ID,
      },
    });
    const taskId = create.json().id;

    const trans = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/transitions`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        toStatus: "investigate",
        note: "Handing off to product",
        newAssigneeUserId: TEST_PRODUCT_ID,
      },
    });
    expect(trans.statusCode).toBe(201);

    const updated = await prisma.task.findUnique({ where: { id: taskId } });
    expect(updated!.assigneeId).toBe(TEST_PRODUCT_ID);

    const history = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${taskId}/transitions`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const rows = history.json().data;
    const reassignRow = rows.find((r: any) => r.note === "Handing off to product");
    expect(reassignRow.newAssignee.id).toBe(TEST_PRODUCT_ID);
  });

  it("rejects inactive or unknown newAssigneeUserId with 422", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { flow: "bug", title: "T", priority: "low" },
    });
    const taskId = create.json().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/transitions`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        toStatus: "investigate",
        note: "x",
        newAssigneeUserId: "00000000-0000-0000-0000-000000009999",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INVALID_USER");
  });

  it("transition without newAssigneeUserId leaves assignee unchanged", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Keep assignee",
        priority: "low",
        assigneeUserId: TEST_ENGINEER_ID,
      },
    });
    const taskId = create.json().id;

    await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/transitions`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { toStatus: "investigate", note: "no reassign" },
    });

    const updated = await prisma.task.findUnique({ where: { id: taskId } });
    expect(updated!.assigneeId).toBe(TEST_ENGINEER_ID);
  });
});
