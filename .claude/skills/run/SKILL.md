---
description: Launch the TaskFlow dev stack (backend + frontend) and open a browser session
---

# Running TaskFlow

## Prerequisites

PostgreSQL must be running. The app expects the `reportal-postgres` container on `localhost:5432`:

```bash
docker ps --filter name=reportal-postgres --format "{{.Status}}"
# must show "Up ..."
```

If it's not running: `docker start reportal-postgres`

## Step 1 — Apply pending migrations

The local DB may be behind the branch. Always run this before starting the backend:

```bash
cd backend && ./node_modules/.bin/prisma migrate deploy
```

It's safe to run repeatedly (no-ops if already current).

## Step 2 — Start the backend

```bash
cd backend && npm run dev
# Listens on http://localhost:3001
```

Verify: `curl -s http://localhost:3001/api/v1/health -H "Authorization: Bearer fake"` should return an UNAUTHORIZED JSON (not a connection error).

## Step 3 — Start the frontend

```bash
cd frontend && npm run dev
# Tries port 5173; falls back to 5174, 5175, … if taken
```

**Important:** Read the actual port from the Vite startup output — `Port 5173 is in use, trying another one...` is common. Use the reported port for all subsequent steps.

## Step 4 — Open a browser session (no Google OAuth needed)

Auth is Google OAuth, but the E2E helpers can mint a JWT directly. Use this script from `frontend/`:

```js
// frontend/dev-login.mjs  (run with: node dev-login.mjs)
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

const id = randomUUID();
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(
    `INSERT INTO users (id, email, display_name, actor_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'human', 'active', NOW(), NOW())`,
    [id, `dev-${Date.now()}@test.local`, "Dev User"]
  );
  await client.query(
    `INSERT INTO org_members (org_id, user_id, role, created_at) VALUES ($1, $2, 'member', NOW())`,
    [DEFAULT_ORG_ID, id]
  );
  const team = await client.query(
    `SELECT id FROM teams WHERE slug = 'engineer' AND org_id = $1 LIMIT 1`,
    [DEFAULT_ORG_ID]
  );
  await client.query(
    `INSERT INTO user_teams (user_id, team_id, is_primary, granted_at) VALUES ($1, $2, true, NOW())`,
    [id, team.rows[0].id]
  );
} finally {
  await client.end();
}

const accessToken = jwt.sign(
  { sub: id, type: "access", orgId: DEFAULT_ORG_ID, orgRole: "member" },
  JWT_SECRET, { expiresIn: "1h" }
);
const refreshToken = jwt.sign(
  { sub: id, type: "refresh" }, JWT_REFRESH_SECRET, { expiresIn: "7d" }
);

console.log("\nOpen http://localhost:5174/login in your browser and run in the console:\n");
console.log(`localStorage.setItem("accessToken", ${JSON.stringify(accessToken)})`);
console.log(`localStorage.setItem("refreshToken", ${JSON.stringify(refreshToken)})`);
console.log(`localStorage.setItem("taskflow_tour_completed", "true")`);
console.log(`\nThen navigate to http://localhost:5174/tasks/feature`);
```

For Playwright-driven demos: use `page.addInitScript` to inject all three localStorage keys (accessToken, refreshToken, taskflow_tour_completed=true) before the first navigation.

## Playwright demo pattern

When you need to screenshot or drive the UI programmatically:

```js
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,           // set true for CI
  executablePath: "/usr/bin/google-chrome",  // system Chrome
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Set auth BEFORE any navigation
await page.addInitScript((tokens) => {
  localStorage.setItem("accessToken", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
  localStorage.setItem("taskflow_tour_completed", "true");
}, { accessToken, refreshToken });

await page.goto("http://localhost:5174/tasks/feature");
await page.waitForSelector('[role="button"][draggable="true"]', { timeout: 10000 });
```

To access Vue component state from `page.evaluate()` — walk `__vueParentComponent` from the root, then read/write `component.setupState.*` (refs are auto-unwrapped).

## Common gotchas

- **Port collision**: Vite silently picks the next free port. Always read the startup output.
- **P2022 / column not found**: database is behind. Run `prisma migrate deploy` (Step 1).
- **500 on /api/v1/tasks**: same as above — missing migration columns.
- **Tour modal blocks board**: inject `taskflow_tour_completed=true` into localStorage.
- **DataTransfer in synthetic drag events**: `setData()` is a no-op in untrusted (non-user-gesture) drag events. Use `page.evaluate()` + `component.setupState` mutation instead.
- **`tasks` is empty in Vue evaluate**: `setupState` auto-unwraps refs — `board.setupState.tasks` IS the array, not a ref. Write via `board.setupState.closePending = value` (no `.value` needed).
