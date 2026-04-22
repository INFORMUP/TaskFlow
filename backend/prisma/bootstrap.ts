import { PrismaClient } from "@prisma/client";
import { seedOrganizations, DEFAULT_ORG_ID } from "./seeders/organization.seeder.js";
import { seedTeams } from "./seeders/teams.js";
import { seedFlows } from "./seeders/flows.js";
import { seedFlowStatuses } from "./seeders/flow-statuses.js";
import { seedFlowTransitions } from "./seeders/flow-transitions.js";
import { seedScopes } from "./seeders/scopes.js";
import { seedUuid } from "./seeders/common.js";

// Bootstrap a fresh production database. Loads the reference data the app
// hard-references (orgs, teams, flows, statuses, transitions, scopes) and
// creates exactly one human admin tied to the default org as `owner`.
//
// Skipped vs `seed.ts`: sample-tasks, projects, agent-users (demo-only).
//
// Required env vars:
//   BOOTSTRAP_ADMIN_EMAIL         — admin's Google account email
//   BOOTSTRAP_ADMIN_DISPLAY_NAME  — shown in UI
//
// Safe to rerun: every reference seeder is idempotent, and this script
// refuses to proceed if any human user already exists — preventing a
// second invocation from clobbering real state.

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL;
const ADMIN_DISPLAY_NAME = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME;

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_DISPLAY_NAME) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_DISPLAY_NAME are required",
    );
  }

  const existingHuman = await prisma.user.findFirst({
    where: { actorType: "human" },
    select: { id: true, email: true },
  });
  if (existingHuman) {
    throw new Error(
      `Refusing to bootstrap — a human user already exists (id=${existingHuman.id}). ` +
        `Bootstrap is a one-time operation for fresh prod DBs.`,
    );
  }

  console.log("Bootstrapping TaskFlow production database...\n");

  const orgId = DEFAULT_ORG_ID;

  const results = [
    await seedOrganizations(prisma),
    await seedTeams(prisma, orgId),
    await seedFlows(prisma, orgId),
    await seedFlowStatuses(prisma),
    await seedFlowTransitions(prisma),
    await seedScopes(prisma),
  ];
  for (const r of results) {
    console.log(`  ${r.name}: ${r.created} created, ${r.skipped} skipped`);
  }

  const engineerTeam = await prisma.team.findFirst({
    where: { orgId, slug: "engineer" },
    select: { id: true },
  });
  if (!engineerTeam) {
    throw new Error("engineer team missing after seedTeams — aborting");
  }

  const adminId = seedUuid("bootstrap-admin", ADMIN_EMAIL);

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: adminId,
        email: ADMIN_EMAIL,
        displayName: ADMIN_DISPLAY_NAME,
        actorType: "human",
        status: "active",
      },
    }),
    prisma.userTeam.create({
      data: {
        userId: adminId,
        teamId: engineerTeam.id,
        isPrimary: true,
      },
    }),
    prisma.orgMember.create({
      data: {
        orgId,
        userId: adminId,
        role: "owner",
      },
    }),
  ]);

  console.log(`\nAdmin user created: ${ADMIN_EMAIL} (${adminId}) — owner of default org, primary on engineer team`);
  console.log("\nBootstrap complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
