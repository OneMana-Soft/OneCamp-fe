import { expect, test } from "@playwright/test"

// Smoke-level E2E for the public /unsubscribe route.
//
// Picked this page because it's the only route that's reachable
// without an auth cookie — perfect for proving that:
//   1. The Next.js server is genuinely up (no 500s),
//   2. The App Router renders client components correctly,
//   3. The Suspense + useSearchParams shape doesn't regress.
//
// As more E2E coverage gets layered on (auth, import flow, task
// creation), we'll seed a test admin via the BE in beforeAll instead
// of relying on a public route.

test.describe("/unsubscribe", () => {
  test("renders the unknown-status state for a direct visit", async ({ page }) => {
    await page.goto("/unsubscribe")

    // The page exposes a heading regardless of which status branch
    // renders. We assert on the document root being non-empty rather
    // than on specific copy so localisation doesn't break the smoke.
    const main = page.locator("body")
    await expect(main).not.toBeEmpty()

    // The page does not 5xx. Playwright's goto would already have
    // surfaced a network-level failure; this catches the case where
    // Next.js returns the static error page after a render throw.
    await expect(page).not.toHaveTitle(/Application error/i)
  })

  test("shows the unsubscribed status when ?status=unsubscribed", async ({ page }) => {
    await page.goto("/unsubscribe?status=unsubscribed&token=test-token")

    // The page strips the token from the URL on mount. Wait for that
    // side-effect, then assert we landed on the no-token URL but kept
    // the status param.
    await page.waitForURL(/\/unsubscribe\?status=unsubscribed$/, { timeout: 5_000 })

    // We don't pin specific copy — the actual wording can change with
    // the i18n catalogue. Anchor on the resubscribe action existing,
    // which is the differentiated UI for this status branch.
    const resubscribe = page.getByRole("button", { name: /resubscribe/i })
    await expect(resubscribe).toBeVisible()
  })
})
