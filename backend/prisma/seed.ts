import { PrismaClient } from "@prisma/client";
import { seedTeams } from "./seeders/teams.js";
import { seedFlows } from "./seeders/flows.js";
import { seedFlowStatuses } from "./seeders/flow-statuses.js";
import { seedFlowTransitions } from "./seeders/flow-transitions.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding TaskFlow database...\n");

  const results = [
    await seedTeams(prisma),
    await seedFlows(prisma),
    await seedFlowStatuses(prisma),
    await seedFlowTransitions(prisma),
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
