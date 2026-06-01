// Dev-only helper: mints a JWT for a fresh user and prints localStorage commands.
// Usage: node dev-login.mjs [teamSlug]  (default: engineer)
// Run with the frontend dev server on; paste the output into your browser console.
import { Client } from "pg";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve("../backend/.env") });

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const DEFAULT_ORG_ID = "2ee0765c-6028-54a4-a201-a639ff748972";
const teamSlug = process.argv[2] ?? "engineer";

const id = randomUUID();
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(
    `INSERT INTO users (id, email, display_name, actor_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'human', 'active', NOW(), NOW())`,
    [id, `dev-${Date.now()}@test.local`, `Dev (${teamSlug})`]
  );
  await client.query(
    `INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ($1, $2, 'member', NOW())`,
    [DEFAULT_ORG_ID, id]
  );
  const team = await client.query(
    `SELECT id FROM teams WHERE slug = $1 AND org_id = $2 LIMIT 1`,
    [teamSlug, DEFAULT_ORG_ID]
  );
  if (team.rowCount === 0) throw new Error(`No team found with slug: ${teamSlug}`);
  await client.query(
    `INSERT INTO user_teams (user_id, team_id, is_primary, granted_at) VALUES ($1, $2, true, NOW())`,
    [id, team.rows[0].id]
  );
} finally {
  await client.end();
}

const accessToken = jwt.sign(
  { sub: id, type: "access", orgId: DEFAULT_ORG_ID, orgRole: "member" },
  JWT_SECRET,
  { expiresIn: "1h" }
);
const refreshToken = jwt.sign(
  { sub: id, type: "refresh" },
  JWT_REFRESH_SECRET,
  { expiresIn: "7d" }
);

const port = process.env.PORT ?? 5174;
console.log(`\nCreated dev user (team: ${teamSlug}). Paste into your browser console:\n`);
console.log(`localStorage.setItem("accessToken", ${JSON.stringify(accessToken)});`);
console.log(`localStorage.setItem("refreshToken", ${JSON.stringify(refreshToken)});`);
console.log(`localStorage.setItem("taskflow_tour_completed", "true");`);
console.log(`\nThen visit: http://localhost:${port}/tasks/feature`);
