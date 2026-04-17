import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createNoTeamUser } from "./helpers/test-user";

test.describe("Welcome to TaskFlow – Join flow", () => {
  test("clicking Join persists team selection and closes the modal", async ({
    page,
  }) => {
    const user = await createNoTeamUser();

    // Seed auth before the SPA boots so the router guard lets us in and
    // `currentUser.load()` fires.
    await page.addInitScript(
      ({ accessToken, refreshToken }) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
      },
      { accessToken: user.accessToken, refreshToken: user.refreshToken }
    );

    await page.goto("/");

    // Modal should appear because the user has no teams.
    await expect(page.getByRole("heading", { name: "Welcome to TaskFlow" })).toBeVisible();

    // Select engineer; toggle() auto-marks the first selection as primary.
    await page.getByTestId("team-toggle-engineer").check();

    const submit = page.getByTestId("team-picker-submit");
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveText("Join");

    await submit.click();

    // Modal must disappear, proving the submit handler completed end-to-end.
    await expect(
      page.getByRole("heading", { name: "Welcome to TaskFlow" })
    ).toBeHidden({ timeout: 5_000 });

    // DB side-effect: exactly one user_teams row for this user.
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query(
        `SELECT t.slug, ut.is_primary
           FROM user_teams ut
           JOIN teams t ON t.id = ut.team_id
          WHERE ut.user_id = $1`,
        [user.id]
      );
      expect(rows).toEqual([{ slug: "engineer", is_primary: true }]);
    } finally {
      await client.end();
    }
  });
});
