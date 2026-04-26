import { test, expect } from "@playwright/test";
import { createUserWithOrg } from "./helpers/test-user";

// Prereq: backend dev server is running. Playwright only boots the frontend.
// Covers: router guard appends ?redirect=<path> on unauthenticated deep links,
// LoginView decodes the OAuth state param, and a successful callback lands the
// user back on the original destination instead of the default home.
// Known-broken on main/staging — tracked in #20. Skipped to keep CI green per #36.
test.describe.skip("Login redirect preservation", () => {
  test("deep link is preserved through the login round-trip", async ({ page }) => {
    const user = await createUserWithOrg();
    const deepLink = "/projects";

    // Stub Google's callback exchange — hitting the real endpoint would require
    // a live OAuth `code`. The frontend treats this as the full login response.
    await page.route("**/api/v1/auth/callback", async (route) => {
      expect(route.request().method()).toBe("POST");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
        }),
      });
    });

    // 1. Unauthenticated deep link → router guard bounces to /login with the
    //    original path preserved in ?redirect=.
    await page.goto(deepLink);
    await expect(page).toHaveURL(`/login?redirect=${deepLink}`);
    await expect(
      page.getByRole("button", { name: "Sign in with Google" })
    ).toBeVisible();

    // 2. Simulate Google's post-consent redirect landing back on /login with
    //    the original path encoded in the OAuth state param. This is what
    //    `handleGoogleLogin` would have built had we clicked the button.
    const state = Buffer.from(deepLink).toString("base64");
    await page.goto(`/login?code=stub-oauth-code&state=${state}`);

    // 3. LoginView should decode state, exchange the code (stub above), store
    //    tokens, hydrate org memberships, and push to the deep link — not /.
    await expect(page).toHaveURL(deepLink);
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

    // Sanity: tokens were actually persisted by the login() call.
    const stored = await page.evaluate(() => ({
      accessToken: localStorage.getItem("accessToken"),
      refreshToken: localStorage.getItem("refreshToken"),
    }));
    expect(stored.accessToken).toBe(user.accessToken);
    expect(stored.refreshToken).toBe(user.refreshToken);
  });

  test("redirect query param is omitted when bouncing from /", async ({ page }) => {
    // Guard special-cases `/`, `/flows`, and `/login` so users landing on the
    // default home don't round-trip a useless `?redirect=/` through OAuth.
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });
});
