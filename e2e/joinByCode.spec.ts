import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// meet-01: a room's name or a link typed under Start meeting, as Meet's
// "Enter a code or link" and Zoom's "Join a meeting" take one, on a production
// build: by keyboard on a computer and by finger on a phone. A name goes to
// the room's member door; what can't be joined is said under the field. With
// SHOTS_DIR set, each state is saved for design review, light and dark.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

const REFUSAL = "Type a room's name, or paste a call's link."

async function openStart(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, { "/config/client": { msg: "ok", data: { features: { calls: true } } } })
  await page.goto("/app/meet/instant", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const field = page.getByRole("textbox", { name: "Or join with a room's name or a link" })
  await expect(field).toBeVisible({ timeout: 60_000 })
  return { field, join: page.getByRole("button", { name: "Join", exact: true }) }
}

for (const theme of SHOT_THEMES) {
  test.describe(`on a computer, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("Enter joins a room by its name at its member door, and junk is said under the field", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const { field, join } = await openStart(page, testInfo)
      await expect(join).toBeDisabled()
      await reviewShot(page, "join-green-room", theme)
      await field.fill("javascript:alert(1)")
      await field.press("Enter")
      await expect(field).toHaveAttribute("aria-invalid", "true")
      await expect(field).toHaveAccessibleDescription(REFUSAL)
      await reviewShot(page, "join-refused", theme)
      await field.fill("Maya Chen")
      await expect(field).not.toHaveAttribute("aria-invalid")
      await reviewShot(page, "join-typed", theme)
      await field.press("Enter")
      await page.waitForURL("**/app/meet/join/r/maya-chen", { timeout: 60_000 })
    })
  })

  test.describe(`on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the field and Join fit the screen, Join sits under the field, and a tap joins", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const { field, join } = await openStart(page, testInfo)
      await reviewShot(page, "join-green-room", theme)
      await field.tap()
      await field.fill("maya-chen")
      const f = await field.boundingBox()
      const j = await join.boundingBox()
      if (!f || !j) throw new Error("the field or Join isn't drawn")
      expect(j.y).toBeGreaterThanOrEqual(f.y + f.height)
      for (const box of [f, j]) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(390)
      }
      expect(Math.round(f.height)).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "join-typed", theme)
      await join.tap()
      await page.waitForURL("**/app/meet/join/r/maya-chen", { timeout: 60_000 })
    })
  })
}
