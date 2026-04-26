import { test, expect } from "@playwright/test";
import { createUserWithTeam } from "./helpers/test-user";

// Prereq: backend dev server is running. Playwright only boots the frontend.
// Covers the full API-token mint flow from SettingsView.vue: create form →
// plaintext-once modal → list refresh → revoke → status flip.
test.describe("API token minting (settings)", () => {
  test("user can mint, view plaintext once, and revoke a token", async ({
    page,
  }) => {
    const user = await createUserWithTeam();

    await page.addInitScript(
      ({ accessToken, refreshToken }) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
      },
      { accessToken: user.accessToken, refreshToken: user.refreshToken }
    );

    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "API Tokens" })).toBeVisible();

    // Empty state before any tokens exist.
    await expect(page.getByTestId("token-list")).toContainText(
      "You have no tokens yet."
    );

    const tokenName = `e2e-${Date.now().toString(36)}`;
    await page.getByTestId("token-name-input").fill(tokenName);
    await page.getByTestId("scope-checkbox-tasks:read").check();

    const submit = page.getByTestId("token-create-submit");
    await expect(submit).toBeEnabled();
    await submit.click();

    // Plaintext-once modal should reveal the secret exactly once.
    const modal = page.getByTestId("token-created-modal");
    await expect(modal).toBeVisible();
    const plaintext = await page.getByTestId("token-plaintext").innerText();
    expect(plaintext.trim().length).toBeGreaterThan(20);

    await page.getByTestId("token-dismiss-button").click();
    await expect(modal).toBeHidden();

    // Refreshed list should now show the new token as Active.
    const list = page.getByTestId("token-list");
    const row = list.locator(`tr`, { hasText: tokenName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Active");

    // Revoke flow: confirm dialog, then row flips to Revoked.
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByTestId("token-revoke-modal")).toBeVisible();
    await page.getByTestId("token-revoke-confirm").click();
    await expect(page.getByTestId("token-revoke-modal")).toBeHidden();

    await expect(row).toContainText("Revoked");
    await expect(row.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  });
});
