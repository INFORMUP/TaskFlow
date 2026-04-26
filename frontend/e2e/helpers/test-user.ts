import { Client } from "pg";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../../backend/.env") });

const DATABASE_URL = process.env.DATABASE_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

// Mirrors backend/src/constants/org.ts. Seeded by prisma/seeders/organization.seeder.ts.
const DEFAULT_ORG_ID = "2ee0765c-6028-54a4-a201-a639ff748972";

export type OrgRole = "owner" | "admin" | "member";

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

interface CreateUserOpts {
  withOrg?: boolean;
  orgRole?: OrgRole;
  // Slug of a seeded team to grant the user, skipping the welcome team-picker
  // modal so tests can drive other flows without dismissing it first.
  teamSlug?: string;
}

async function createUser(opts: CreateUserOpts = {}): Promise<TestUser> {
  const id = randomUUID();
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `e2e-${suffix}@test.local`;

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO users (id, email, display_name, actor_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'human', 'active', NOW(), NOW())`,
      [id, email, `E2E ${suffix}`]
    );
    if (opts.withOrg) {
      await client.query(
        `INSERT INTO org_members (org_id, user_id, role, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [DEFAULT_ORG_ID, id, opts.orgRole ?? "member"]
      );
    }
    if (opts.teamSlug) {
      const team = await client.query(
        `SELECT id FROM teams WHERE slug = $1 AND org_id = $2 LIMIT 1`,
        [opts.teamSlug, DEFAULT_ORG_ID]
      );
      if (team.rowCount === 0) {
        throw new Error(`Seeded team not found for slug: ${opts.teamSlug}`);
      }
      await client.query(
        `INSERT INTO user_teams (user_id, team_id, is_primary, granted_at)
         VALUES ($1, $2, true, NOW())`,
        [id, team.rows[0].id]
      );
    }
  } finally {
    await client.end();
  }

  const accessPayload: Record<string, unknown> = { sub: id, type: "access" };
  if (opts.withOrg) {
    accessPayload.orgId = DEFAULT_ORG_ID;
    accessPayload.orgRole = opts.orgRole ?? "member";
  }

  const accessToken = jwt.sign(accessPayload, JWT_SECRET, { expiresIn: "1h" });
  const refreshToken = jwt.sign({ sub: id, type: "refresh" }, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });

  return { id, email, accessToken, refreshToken };
}

export function createNoTeamUser(): Promise<TestUser> {
  return createUser();
}

export function createUserWithOrg(role: OrgRole = "member"): Promise<TestUser> {
  return createUser({ withOrg: true, orgRole: role });
}

export function createUserWithTeam(
  teamSlug = "engineer",
  role: OrgRole = "member"
): Promise<TestUser> {
  return createUser({ withOrg: true, orgRole: role, teamSlug });
}
