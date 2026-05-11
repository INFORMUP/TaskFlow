import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createUserWithOrg, type TestUser } from "./helpers/test-user";

const DEFAULT_ORG_ID = "2ee0765c-6028-54a4-a201-a639ff748972";

async function joinEngineerTeam(userId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO user_teams (user_id, team_id, is_primary, granted_at)
       SELECT $1, id, true, NOW() FROM teams WHERE slug = 'engineer'`,
      [userId],
    );
  } finally {
    await client.end();
  }
}

async function authAndSkipModals(
  page: import("@playwright/test").Page,
  user: TestUser,
) {
  await page.addInitScript(
    ({ accessToken, refreshToken }) => {
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("taskflow_tour_completed", "true");
    },
    { accessToken: user.accessToken, refreshToken: user.refreshToken },
  );
}

async function seedFeedback(
  orgId: string,
  userId: string,
  rows: Array<{ type: string; message: string }>,
): Promise<string[]> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const ids: string[] = [];
  try {
    for (const r of rows) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO feedback (id, org_id, user_id, type, message)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)
         RETURNING id`,
        [orgId, userId, r.type, r.message],
      );
      ids.push(res.rows[0].id);
    }
  } finally {
    await client.end();
  }
  return ids;
}

async function firstProjectId(): Promise<string> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query<{ id: string }>(
      `SELECT p.id
         FROM projects p
         JOIN project_flows pf ON pf.project_id = p.id
         JOIN flows f ON f.id = pf.flow_id
        WHERE p.org_id = $1 AND f.slug = 'bug'
        ORDER BY p.created_at ASC
        LIMIT 1`,
      [DEFAULT_ORG_ID],
    );
    if (res.rowCount === 0) {
      throw new Error("No seeded project with the 'bug' flow available.");
    }
    return res.rows[0].id;
  } finally {
    await client.end();
  }
}

test.describe("Admin feedback list", () => {
  test("admin can view feedback rows", async ({ page }) => {
    const user = await createUserWithOrg("owner");
    await joinEngineerTeam(user.id);
    const stamp = Date.now();
    await seedFeedback(DEFAULT_ORG_ID, user.id, [
      { type: "BUG", message: `e2e list ${stamp}` },
      { type: "FEATURE", message: `e2e list feat ${stamp}` },
    ]);

    await authAndSkipModals(page, user);
    await page.goto("/organization/feedback");

    await expect(page.getByText(`e2e list ${stamp}`)).toBeVisible();
    await expect(page.getByText(`e2e list feat ${stamp}`)).toBeVisible();
  });

  test("admin promotes a feedback row into a task", async ({ page }) => {
    const user = await createUserWithOrg("owner");
    await joinEngineerTeam(user.id);
    const stamp = Date.now();
    const [feedbackId] = await seedFeedback(DEFAULT_ORG_ID, user.id, [
      { type: "BUG", message: `e2e promote ${stamp}` },
    ]);
    const projectId = await firstProjectId();

    await authAndSkipModals(page, user);
    await page.goto("/organization/feedback");

    const row = page.getByTestId(`feedback-row-${feedbackId}`);
    await expect(row).toBeVisible();
    await row.click();

    await page
      .getByTestId(`feedback-project-select-${feedbackId}`)
      .selectOption(projectId);
    await page.getByTestId(`feedback-promote-${feedbackId}`).click();

    await expect(
      page.getByTestId(`feedback-task-link-${feedbackId}`),
    ).toBeVisible();
  });
});
