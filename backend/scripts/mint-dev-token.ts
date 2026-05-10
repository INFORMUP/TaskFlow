// Dev-only: provision a TaskFlow user with a specific orgRole + team set and
// mint a JWT you can paste into the browser to test as that persona without
// going through Google OAuth.
//
// Run from backend/:
//   npx tsx scripts/mint-dev-token.ts                              # owner / [user] (BUG-18 repro)
//   npx tsx scripts/mint-dev-token.ts --role member --teams engineer
//   npx tsx scripts/mint-dev-token.ts --slug bug42-perf --role admin --teams product
//
// After the script prints the JWT, paste the three localStorage lines into
// DevTools at http://localhost:5173 to log in as the persona.

import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { config } from "../src/config.js";
import { DEFAULT_ORG_ID } from "../src/constants/org.js";
import { seedUuid } from "../prisma/seeders/common.js";

const prisma = new PrismaClient();

interface Args {
  slug: string;
  role: "owner" | "admin" | "member";
  teams: string[];
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = { slug: "owner-only", role: "owner", teams: ["user"] };
  for (let i = 0; i < args.length; i++) {
    const v = args[i + 1];
    switch (args[i]) {
      case "--slug": out.slug = v; i++; break;
      case "--role": out.role = v as Args["role"]; i++; break;
      case "--teams": out.teams = v.split(",").map((s) => s.trim()).filter(Boolean); i++; break;
    }
  }
  return out;
}

async function main() {
  const { slug, role, teams } = parseArgs();
  const userId = seedUuid("user", `dev-${slug}`);
  const email = `dev-${slug}@dev.local`;
  const displayName = `Dev ${slug} (${role}, [${teams.join(",")}])`;

  await prisma.user.upsert({
    where: { id: userId },
    update: { displayName },
    create: { id: userId, email, displayName, actorType: "human", status: "active" },
  });

  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: DEFAULT_ORG_ID, userId } },
    update: { role },
    create: { orgId: DEFAULT_ORG_ID, userId, role },
  });

  // Replace team memberships with exactly the requested set.
  await prisma.userTeam.deleteMany({ where: { userId } });
  for (let i = 0; i < teams.length; i++) {
    await prisma.userTeam.create({
      data: { userId, teamId: seedUuid("team", teams[i]), isPrimary: i === 0 },
    });
  }

  const accessToken = jwt.sign(
    { sub: userId, type: "access", orgId: DEFAULT_ORG_ID, orgRole: role },
    config.jwtSecret,
    { expiresIn: "8h" },
  );
  const refreshToken = jwt.sign(
    { sub: userId, type: "refresh" },
    config.jwtRefreshSecret,
    { expiresIn: "7d" },
  );

  console.log(`# Dev persona`);
  console.log(`User ID:      ${userId}`);
  console.log(`Display name: ${displayName}`);
  console.log(`orgRole:      ${role}`);
  console.log(`Teams:        [${teams.join(", ")}]`);
  console.log("");
  console.log(`# Paste into browser DevTools at http://localhost:5173 :`);
  console.log(`localStorage.setItem("accessToken", ${JSON.stringify(accessToken)});`);
  console.log(`localStorage.setItem("refreshToken", ${JSON.stringify(refreshToken)});`);
  console.log(`location.href = "/";`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
