import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createUserWithOrg, type TestUser } from "./helpers/test-user";

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

test.describe("Feedback bubble", () => {
  test("submits improvement feedback from an authenticated page", async ({
    page,
  }) => {
    const user = await createUserWithOrg();
    await joinEngineerTeam(user.id);
    await authAndSkipModals(page, user);

    await page.goto("/projects");

    const bubble = page.getByTestId("feedback-bubble-button");
    await expect(bubble).toBeVisible();
    await bubble.click();

    await expect(page.getByTestId("feedback-bubble-panel")).toBeVisible();

    await page.getByTestId("feedback-type-improvement").click();
    await expect(page.getByTestId("feedback-type-improvement")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const message = `E2E improvement ${Date.now()}`;
    await page.getByTestId("feedback-message").fill(message);

    const submit = page.getByTestId("feedback-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId("feedback-success")).toBeVisible({
      timeout: 5_000,
    });
    // panel auto-collapses after the ~1.5s success flash
    await expect(page.getByTestId("feedback-bubble-panel")).toBeHidden({
      timeout: 5_000,
    });
    await expect(page.getByTestId("feedback-bubble-button")).toBeVisible();

    const verify = new Client({ connectionString: process.env.DATABASE_URL });
    await verify.connect();
    try {
      const { rows } = await verify.query(
        `SELECT type, message, page, user_id
           FROM feedback
          WHERE user_id = $1 AND message = $2`,
        [user.id, message],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("IMPROVEMENT");
      expect(rows[0].page).toContain("/projects");
    } finally {
      await verify.end();
    }
  });

  test("submit is disabled until a message is typed", async ({ page }) => {
    const user = await createUserWithOrg();
    await joinEngineerTeam(user.id);
    await authAndSkipModals(page, user);

    await page.goto("/projects");
    await page.getByTestId("feedback-bubble-button").click();

    const submit = page.getByTestId("feedback-submit");
    await expect(submit).toBeDisabled();

    await page.getByTestId("feedback-message").fill("something");
    await expect(submit).toBeEnabled();
  });
});
