import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { contrastRatio, rgbToHex } from "../lib/color/oklch"
import { inkAndGround } from "./contrast"
import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// A primary button's key hint ("C" on My tasks' New task, "Ctrl ↵" on Create
// task) is drawn on the button's own fill, outlined, so its letter reads at AA:
// on a lighter wash of the brand it read 3.51:1 in light (components/ui/button).
// A phone hints at no keys: its My tasks keeps New task in the list's options.

async function openMyTasks(page: Page, testInfo: TestInfo) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {})
  await page.goto("/app/myTask", { waitUntil: "domcontentloaded", timeout: 120_000 })
}

for (const theme of SHOT_THEMES) {
  test.describe(`a primary button's key hint at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("reads at AA on the button, and the button opens New task", async ({ page }, testInfo) => {
      await openMyTasks(page, testInfo)
      const button = page.getByRole("button", { name: "New task" }).filter({ has: page.locator(".kbd") }).first()
      await expect(button).toBeVisible({ timeout: 60_000 })
      const hint = button.locator(".kbd")
      await expect(hint).toBeVisible()
      const { ink, ground } = await inkAndGround(page, hint)
      expect(contrastRatio(ink, ground), `"${await hint.textContent()}" ${rgbToHex(ink)} on ${rgbToHex(ground)}`).toBeGreaterThanOrEqual(4.5)
      await reviewShot(page, "button-key-hint", theme)
      await button.click()
      await expect(page.getByLabel("Task title")).toBeVisible({ timeout: 30_000 })
    })
  })
}

test.describe("a primary button's key hint on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("shows no key, and the list's options open New task by touch", async ({ page }, testInfo) => {
    await openMyTasks(page, testInfo)
    const options = page.getByRole("button", { name: "Task list options" })
    await expect(options).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(".kbd:visible")).toHaveCount(0)
    await options.tap()
    await page.getByRole("dialog", { name: "My tasks" }).getByRole("button", { name: "Create task" }).tap()
    await expect(page.getByLabel("Task title")).toBeVisible({ timeout: 60_000 })
  })
})
