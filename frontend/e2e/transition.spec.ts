import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { createUserWithTeam } from "./helpers/test-user";

const API_BASE = process.env.VITE_API_BASE_URL || "http://localhost:3001";

test.describe("Task transition", () => {
  test("engineer transitions a bug task from triage to closed", async ({ page }) => {
    const user = await createUserWithTeam("engineer");

    // Create a bug task on the TF project via the API. The bug flow's initial
    // status is `triage`; engineer can transition triage → closed per the
    // permission matrix.
    const dbClient = new Client({ connectionString: process.env.DATABASE_URL });
    await dbClient.connect();
    let projectId: string;
    try {
      const { rows } = await dbClient.query(
        `SELECT id FROM projects WHERE key = 'TF' LIMIT 1`,
      );
      if (rows.length === 0) {
        throw new Error("TF project not seeded — run `npx prisma db seed` first");
      }
      projectId = rows[0].id;
    } finally {
      await dbClient.end();
    }

    const title = `E2E transition ${Date.now()}`;
    const createRes = await fetch(`${API_BASE}/api/v1/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        flow: "bug",
        title,
        priority: "medium",
        projectIds: [projectId],
      }),
    });
    if (!createRes.ok) throw new Error(`create failed ${createRes.status}: ${await createRes.text()}`);
    const task = await createRes.json();
    expect(task.currentStatus.slug).toBe("triage");

    await page.addInitScript(
      ({ accessToken, refreshToken }) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
        localStorage.setItem("taskflow_tour_completed", "true");
      },
      { accessToken: user.accessToken, refreshToken: user.refreshToken },
    );

    await page.goto(`/tasks/bug/${task.id}`);

    await expect(page.locator(".detail__status")).toHaveText("Triage", { timeout: 10_000 });

    await page.getByLabel("New status").selectOption("closed");
    await page.getByLabel("Transition note").fill("Resolving via e2e test");
    await page.getByLabel("Resolution").selectOption("fixed");

    const transitionBtn = page.getByRole("button", { name: "Transition" });
    await expect(transitionBtn).toBeEnabled();
    await transitionBtn.click();

    // The transition form is hidden once currentStatus.slug === 'closed', and
    // the status badge re-renders.
    await expect(page.locator(".detail__status")).toHaveText("Closed", { timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Transition" })).toBeHidden();

    // Verify history shows the new transition with the supplied note.
    await expect(
      page.locator(".timeline__item", { hasText: "Resolving via e2e test" }),
    ).toBeVisible();

    // Verify persistence at the DB level.
    const verify = new Client({ connectionString: process.env.DATABASE_URL });
    await verify.connect();
    try {
      const { rows } = await verify.query(
        `SELECT s.slug AS status_slug, t.resolution
           FROM tasks t
           JOIN flow_statuses s ON s.id = t.current_status_id
          WHERE t.id = $1`,
        [task.id],
      );
      expect(rows).toEqual([{ status_slug: "closed", resolution: "fixed" }]);

      const { rows: trRows } = await verify.query(
        `SELECT note FROM task_transitions WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [task.id],
      );
      expect(trRows[0].note).toBe("Resolving via e2e test");
    } finally {
      await verify.end();
    }
  });
});
