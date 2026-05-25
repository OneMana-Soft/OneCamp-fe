import { expect, test } from "@playwright/test"

// Smoke E2E for the public /reset-password route.
//
// Coverage rationale
// ------------------
//   1. Validates that the token-from-URL → state → render path works
//      under Next.js's App Router + Suspense. This mirrors the same
//      pattern /unsubscribe uses, and a regression here would surface
//      as a blank page for every password-reset email recipient.
//   2. The "no token" branch is purely client-rendered, so we get
//      coverage of the SWRConfig provider and lazy-load infrastructure
//      without needing a backend.
//
// We do NOT submit the form because that requires a live backend with
// a valid token. The submit path is unit-tested via authService.

test.describe("/reset-password", () => {
  test("shows the invalid-link state when no token is present", async ({ page }) => {
    await page.goto("/reset-password")

    // The page renders an explicit "invalid reset link" header. We
    // anchor on the heading text rather than i18n keys so a future
    // localisation pass doesn't silently break the test — the heading
    // is fixed English copy in the source.
    await expect(
      page.getByRole("heading", { name: /invalid reset link/i }),
    ).toBeVisible()

    // The "request a new link" CTA must be reachable so a user who
    // landed here from an expired email has a clear next step. The
    // button is inside a <Link href="/forgot-password">, so we anchor
    // on the button's accessible name.
    await expect(
      page.getByRole("button", { name: /request new link/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("renders the password form when a token is present", async ({ page }) => {
    await page.goto("/reset-password?token=fake-test-token")

    // Don't depend on specific copy: the differentiated UI for the
    // token-present branch is the password input itself, which
    // doesn't exist in the no-token branch.
    const password = page.locator('input[type="password"]').first()
    await expect(password).toBeVisible({ timeout: 5_000 })
  })
})
