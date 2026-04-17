import { PrismaClient } from "@prisma/client";
import { seedOrganizations, DEFAULT_ORG_ID } from "./seeders/organization.seeder.js";
import { seedTeams } from "./seeders/teams.js";
import { seedFlows } from "./seeders/flows.js";
import { seedFlowStatuses } from "./seeders/flow-statuses.js";
import { seedFlowTransitions } from "./seeders/flow-transitions.js";
import { seedSampleTasks } from "./seeders/sample-tasks.js";
import { seedProjects } from "./seeders/projects.js";
import { seedScopes } from "./seeders/scopes.js";
import { seedAgentUsers } from "./seeders/agent-users.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding TaskFlow database...\n");

  const orgId = DEFAULT_ORG_ID;

  const results = [
    await seedOrganizations(prisma),
    await seedTeams(prisma, orgId),
    await seedFlows(prisma, orgId),
    await seedFlowStatuses(prisma),
    await seedFlowTransitions(prisma),
    await seedScopes(prisma),
    await seedAgentUsers(prisma, orgId),
    ...(await seedSampleTasks(prisma, orgId)),
    ...(await seedProjects(prisma, orgId)),
  ];

  for (const r of results) {
    console.log(`  ${r.name}: ${r.created} created, ${r.skipped} skipped`);
  }

  console.log("\nSeeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
