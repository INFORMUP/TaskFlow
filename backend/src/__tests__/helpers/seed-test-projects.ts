import { PrismaClient } from "@prisma/client";
import { seedUuid } from "../../../prisma/seeders/common.js";

export const TEST_PROJECT_ID = seedUuid("test-project", "default");

/**
 * Seeds a single project visible to every test team. Idempotent: safe to
 * call in every test's beforeAll/beforeEach.
 */
export async function seedTestProjects(prisma: PrismaClient) {
  const existing = await prisma.project.findUnique({ where: { id: TEST_PROJECT_ID } });
  const teamIds = [
    seedUuid("team", "engineer"),
    seedUuid("team", "product"),
    seedUuid("team", "user"),
    seedUuid("team", "agent"),
  ];
  if (!existing) {
    await prisma.project.create({
      data: {
        id: TEST_PROJECT_ID,
        key: "TEST",
        name: "Test project",
        ownerUserId: "00000000-0000-0000-0000-000000000001", // TEST_ENGINEER_ID
        teams: { create: teamIds.map((teamId) => ({ teamId })) },
      },
    });
  }
}
