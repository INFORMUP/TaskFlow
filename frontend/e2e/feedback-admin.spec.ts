import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createUserWithOrg, type TestUser } from "./helpers/test-user";

const DEFAULT_ORG_ID = "2ee0765c-6028-54a4-a201-a639ff748972";

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
  rows: Array<{ type: string; message: string; taskLinkStatus: string }>,
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const r of rows) {
      await client.query(
        `INSERT INTO feedback (id, org_id, user_id, type, message, task_link_status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
        [orgId, userId, r.type, r.message, r.taskLinkStatus],
      );
    }
  } finally {
    await client.end();
  }
}

test.describe("Admin feedback list", () => {
  test("admin can view feedback and filter by status", async ({ page }) => {
    const user = await createUserWithOrg("owner");
    const stamp = Date.now();
    await seedFeedback(DEFAULT_ORG_ID, user.id, [
      { type: "BUG", message: `e2e linked ${stamp}`, taskLinkStatus: "linked" },
      {
        type: "BUG",
        message: `e2e failed ${stamp}`,
        taskLinkStatus: "failed_create",
      },
    ]);

    await authAndSkipModals(page, user);
    await page.goto("/organization/feedback");

    await expect(page.getByText(`e2e linked ${stamp}`)).toBeVisible();
    await expect(page.getByText(`e2e failed ${stamp}`)).toBeVisible();

    await page
      .getByTestId("feedback-status-filter")
      .selectOption("failed_create");

    await expect(page.getByText(`e2e failed ${stamp}`)).toBeVisible();
    await expect(page.getByText(`e2e linked ${stamp}`)).toHaveCount(0);
  });
});
