import { PrismaClient } from "@prisma/client";
import { seedUuid } from "../../../prisma/seeders/common.js";
import {
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
  TEST_USER_ID,
  TEST_AGENT_ID,
} from "./auth.js";

export async function seedTestUsers(prisma: PrismaClient) {
  const engineerTeamId = seedUuid("team", "engineer");
  const productTeamId = seedUuid("team", "product");
  const userTeamId = seedUuid("team", "user");
  const agentTeamId = seedUuid("team", "agent");

  const users = [
    {
      id: TEST_ENGINEER_ID,
      email: "engineer@test.com",
      displayName: "Test Engineer",
      actorType: "human",
      status: "active",
      teamId: engineerTeamId,
    },
    {
      id: TEST_PRODUCT_ID,
      email: "product@test.com",
      displayName: "Test Product",
      actorType: "human",
      status: "active",
      teamId: productTeamId,
    },
    {
      id: TEST_USER_ID,
      email: "user@test.com",
      displayName: "Test User",
      actorType: "human",
      status: "active",
      teamId: userTeamId,
    },
    {
      id: TEST_AGENT_ID,
      email: null,
      displayName: "Test Agent",
      actorType: "agent",
      status: "active",
      teamId: agentTeamId,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        actorType: u.actorType,
        status: u.status,
      },
    });
    // Add team membership
    await prisma.userTeam.upsert({
      where: { userId_teamId: { userId: u.id, teamId: u.teamId } },
      update: {},
      create: { userId: u.id, teamId: u.teamId, isPrimary: true },
    });
  }
}
