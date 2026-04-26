import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createUserWithOrg } from "./helpers/test-user";

test.describe("Task creation", () => {
  test("engineer creates a bug task on the TF project", async ({ page }) => {
    const user = await createUserWithOrg();

    // Engineer team membership is what the permission matrix checks for
    // `create` on the "bug" flow — the bare org membership from the helper
    // isn't enough.
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO user_teams (user_id, team_id, is_primary, granted_at)
         SELECT $1, id, true, NOW() FROM teams WHERE slug = 'engineer'`,
        [user.id],
      );
    } finally {
      await client.end();
    }

    await page.addInitScript(
      ({ accessToken, refreshToken }) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
        localStorage.setItem("taskflow_tour_completed", "true");
      },
      { accessToken: user.accessToken, refreshToken: user.refreshToken },
    );

    await page.goto("/tasks/bug");

    const createBtn = page.getByRole("button", { name: "+ New Task" });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    const title = `E2E bug ${Date.now()}`;
    await page.getByPlaceholder("Title", { exact: true }).fill(title);

    // Checking the TF project triggers the watcher that loads that project's
    // attached flows and auto-fills the default assignee. The "bug" flow comes
    // from the route prop, so once flows load it should be the selected value.
    const tfLabel = page.locator("label.create-form__project", {
      hasText: "TaskFlow",
    });
    await expect(tfLabel).toBeVisible({ timeout: 10_000 });
    await tfLabel.locator("input[type='checkbox']").check();

    const flowSelect = page.locator("select.create-form__select").first();
    await expect(flowSelect).toHaveValue("bug", { timeout: 5_000 });

    const submit = page.getByRole("button", { name: "Create" });
    await expect(submit).toBeEnabled({ timeout: 5_000 });
    await submit.click();

    // Form unmounts via the `created` emit once the POST resolves.
    await expect(page.getByPlaceholder("Title")).toBeHidden({ timeout: 5_000 });

    // The board view reloads tasks on `created` — the new task should appear
    // as a card with its title.
    await expect(
      page.locator(".card__title", { hasText: title }),
    ).toBeVisible({ timeout: 5_000 });

    const verify = new Client({ connectionString: process.env.DATABASE_URL });
    await verify.connect();
    try {
      const { rows } = await verify.query(
        `SELECT t.title, t.priority, f.slug AS flow_slug, p.key AS project_key
           FROM tasks t
           JOIN flows f ON f.id = t.flow_id
           JOIN task_projects tp ON tp.task_id = t.id
           JOIN projects p ON p.id = tp.project_id
          WHERE t.title = $1`,
        [title],
      );
      expect(rows).toEqual([
        {
          title,
          priority: "medium",
          flow_slug: "bug",
          project_key: "TF",
        },
      ]);
    } finally {
      await verify.end();
    }
  });
});
