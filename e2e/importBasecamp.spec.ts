import { expect, test, type Locator, type Page } from "@playwright/test"

import { importPage } from "./adminImport"
import { SHOT_THEMES, reviewShot } from "./stubbedApp"

// basecamp-46: Basecamp has no tokens to paste. The admin signs in at
// Basecamp from the connect dialog and comes back to the import page, which
// says how it went and asks which of the sign-in's accounts to bring; the
// account picked goes into the job. At 1280 by the pointer and at 390 by
// touch; dark too when SHOTS_DIR wants the review shots.

async function openConnect(page: Page, press: (l: Locator) => Promise<void>) {
  const tool = page.getByRole("radiogroup", { name: "Tool to import from" }).getByRole("radio", { name: "Basecamp" })
  await expect(tool).toBeVisible({ timeout: 90_000 })
  await press(tool)
  await press(page.getByRole("button", { name: "Connect Basecamp" }))
  return page.getByRole("dialog", { name: "Connect Basecamp" })
}

for (const theme of SHOT_THEMES) {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    test.describe(`Basecamp's sign-in at ${viewport.width}, ${theme}`, () => {
      // A finger on a phone, the pointer at a desk.
      const phone = viewport.width < 640
      test.use({ viewport, colorScheme: theme, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
      const press = (l: Locator) => (phone ? l.tap() : l.click())

      test("connecting Basecamp asks to sign in there, with no token to paste", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true)
        const dialog = await openConnect(page, press)
        await expect(dialog.getByRole("button", { name: "Continue to Basecamp" })).toBeVisible()
        await expect(dialog.getByLabel(/token/i)).toHaveCount(0)
        await reviewShot(page, "import-basecamp-connect", theme)
      })

      test("a server without Basecamp's app says how to set it up, once", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, false)
        const dialog = await openConnect(page, press)
        await expect(dialog.getByText(/launchpad\.37signals\.com\/integrations/)).toBeVisible()
        // The server's own sentence, not a second, vaguer one above it.
        await expect(dialog.getByText(/isn't set up/)).toHaveCount(1)
        await expect(dialog.getByRole("button", { name: "Continue to Basecamp" })).toHaveCount(0)
        await reviewShot(page, "import-basecamp-not-set-up", theme)
      })

      test("coming back connected says so and asks which account to bring", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        await importPage(page, testInfo, true, "&connected=basecamp")
        // The toast's title; its live region reads the whole toast out, title included.
        await expect(page.getByText("Basecamp connected", { exact: true })).toBeVisible({ timeout: 90_000 })
        expect(new URL(page.url()).searchParams.get("connected")).toBeNull()
        await expect(page.getByRole("radiogroup", { name: "Tool to import from" }).getByRole("radio", { name: "Basecamp" })).toHaveAttribute("aria-checked", "true")
        await expect(page.getByText("Connected as Acme")).toBeVisible()
        const pick = page.getByRole("combobox", { name: "Pick a Basecamp account" })
        await expect(pick).toBeVisible()
        await pick.scrollIntoViewIfNeeded()
        // Start import is the one thing to do here, and waits for an account.
        const start = page.getByRole("button", { name: "Start import" })
        await expect(start).toBeDisabled()
        await reviewShot(page, "import-basecamp-connected", theme)
        // The app's own picker (no native select): the accounts, then the name follows the pick.
        await press(pick)
        await expect(page.getByRole("option")).toHaveText(["Acme", "Acme Studio"])
        await reviewShot(page, "import-basecamp-picker", theme)
        await press(page.getByRole("option", { name: "Acme Studio" }))
        await expect(page.getByLabel("Workspace name")).toHaveValue("Acme Studio")
        await expect(start).toBeEnabled()
        await reviewShot(page, "import-basecamp-ready", theme)
      })

      test("signing in goes there and comes back, and the account picked goes into the job", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        const state = await importPage(page, testInfo, true)
        const dialog = await openConnect(page, press)
        await press(dialog.getByRole("button", { name: "Continue to Basecamp" }))
        // Back on the import page, the address as it was before the sign-in.
        await expect(page).toHaveURL(/\/app\/admin\?tab=import$/, { timeout: 60_000 })
        await expect(page.getByText("Basecamp connected", { exact: true })).toBeVisible()
        await expect(page.getByText("Connected as Acme")).toBeVisible()
        await press(page.getByRole("combobox", { name: "Pick a Basecamp account" }))
        await press(page.getByRole("option", { name: "Acme Studio" }))
        await press(page.getByRole("button", { name: "Start import" }))
        await expect.poll(() => state.job).toMatchObject({ source_workspace_name: "Acme Studio", source: "api", options: { account_id: "1001" } })
      })
    })
  }
}
