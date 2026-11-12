import { expect, test } from "@playwright/test"

import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// Forgot password on a server that can't send email, in a real browser with
// no backend (SHELL-26). The public sign-in answer says whether mailed links
// can arrive (email_configured); without email the page says no link will
// come and who can help, instead of "a link is on its way" and Send again.
// With SHOTS_DIR=<dir> it is saved at 1280 and 390, light and dark.

const OFF = "This workspace can't send email yet, so no link will arrive. Ask your workspace admin to set up email or to help you sign in."

for (const theme of SHOT_THEMES) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`forgot password, ${label}, ${theme}`, () => {
      test.use(use)

      test("forgot password on a server without email is honest", async ({ page }, testInfo) => {
        test.setTimeout(120_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        let resets = 0
        await stubBackend(page, testInfo, {
          "/auth/providers": { status: "success", providers: { email: true }, email_configured: false, workspace_name: "" },
          "/auth/forgot-password": () => {
            resets++
            return { status: "success" }
          },
        })
        await page.goto("/forgot-password", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.getByRole("note")).toHaveText(OFF)
        await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0)
        await expect(page.getByRole("button", { name: /Send again/ })).toHaveCount(0)
        await expect(page.getByText(/on its way/)).toHaveCount(0)
        await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible()
        await reviewShot(page, "forgot-email-off", theme)
        expect(resets).toBe(0)
      })
    })
  }
}

test.describe("forgot password on a server with email, at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("asks for the address and says the link is on its way, as before", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await stubBackend(page, testInfo, {
      "/auth/providers": { status: "success", providers: { email: true }, email_configured: true, workspace_name: "" },
      "/auth/forgot-password": { status: "success" },
    })
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByLabel("Email address").fill("priya@kestrel.studio")
    await page.getByRole("button", { name: "Send reset link" }).click()
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()
    await expect(page.getByRole("button", { name: /Send again in/ })).toBeVisible()
    await expect(page.getByRole("note")).toHaveCount(0)
  })
})
