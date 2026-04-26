import { PrismaClient } from "@prisma/client";
import { seedOrganizations, DEFAULT_ORG_ID } from "./seeders/organization.seeder.js";
import { seedTeams } from "./seeders/teams.js";
import { seedFlows } from "./seeders/flows.js";
import { seedFlowStatuses } from "./seeders/flow-statuses.js";
import { seedFlowTransitions } from "./seeders/flow-transitions.js";
import { seedScopes } from "./seeders/scopes.js";

// Idempotent backfill of reference data the app hard-references (orgs, teams,
// flows, statuses, transitions, scopes). Unlike `bootstrap.ts`, this script
// does NOT create an admin user and does NOT refuse to run on a populated DB
// — every seeder it invokes is idempotent and safe to rerun.
//
// Use this when reference-data seeders are added after a DB was bootstrapped
// (e.g. scopes added post-launch on staging/prod).

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding reference data...\n");

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

  console.log("\nReference seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
