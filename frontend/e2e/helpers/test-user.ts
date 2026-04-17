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

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export async function createNoTeamUser(): Promise<TestUser> {
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
  } finally {
    await client.end();
  }

  const accessToken = jwt.sign({ sub: id, type: "access" }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const refreshToken = jwt.sign({ sub: id, type: "refresh" }, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });

  return { id, email, accessToken, refreshToken };
}
