import { expect, test } from "@playwright/test"

import { SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { settled } from "./sheetLayout"

// "Push to my phone while I'm in OneCamp" (A4 H4, slack TN-87), as Sam meets it
// in Settings > Notifications, at 1280 and at 390 with touch, in both themes.
// The person's own notify.push_delay: never set, it says 1 minute; a choice
// shows at once and is sent as PUT /user/preferences/notify.push_delay; one the
// server refuses goes back and the row says why. On a phone the picker is a
// drawer standing on the screen's foot, across its width.

const LABEL = "Push to my phone while I'm in OneCamp"
const REFUSED = "Choose right away, or 1, 5 or 10 minutes."
const HELP = "While you're in OneCamp, a push waits this long and is skipped if you read it first."

const prefs = {
  email_supported: true,
  email_enabled: true,
  email_digest_frequency: "off",
  quiet_hours_enabled: false,
  read_receipts: true,
  read_receipts_allowed: true,
}

for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      test("the push wait: 1 minute until chosen, a choice saved at once, a refused one put back with why", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: unknown[] = []
        const mine: Record<string, unknown> = {}
        let refuse = false
        await stubBackend(page, testInfo, {
          "/me/keywords": { msg: "ok", data: [] },
          "/me/vips": { msg: "ok", data: [] },
          "/user/notificationPreferences": (_: URL, request: { method: () => string }) => (request.method() === "GET" ? { msg: "ok", data: prefs } : { msg: "ok" }),
          "/user/preferences": (url: URL, request: { method: () => string; postDataJSON: () => unknown }) => {
            if (request.method() === "GET") return { msg: "ok", data: mine }
            const body = request.postDataJSON() as { value: unknown }
            sent.push([url.pathname.replace(/^.*\/user\/preferences/, ""), body])
            if (refuse) return withStatus(400, { msg: REFUSED })
            mine["notify.push_delay"] = body.value
            return { msg: "ok", data: { key: "notify.push_delay", value: body.value } }
          },
        })
        await page.goto("/app/settings/notifications", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const trigger = page.getByRole("combobox", { name: LABEL })
        await expect(trigger).toBeVisible({ timeout: 60_000 })
        await trigger.scrollIntoViewIfNeeded()
        await expect(trigger).toHaveText("After 1 minute")
        const row = page.locator("[data-setting-row]").filter({ has: trigger })
        // The help words are whole at every width: the shared row clamps a
        // description to two lines, and at 390 a longer one lost its promise
        // (DESIGN-BUILD-142 F1).
        const help = page.locator(`[id="${await trigger.getAttribute("aria-describedby")}"]`)
        await expect(help).toHaveText(HELP)
        expect(await help.evaluate((el) => el.scrollHeight <= el.clientHeight), "the help words fit the row's two lines").toBe(true)
        // The row fits the width: nothing scrolls sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await reviewShot(page, "push-delay-card", theme)

        const pick = async (name: string) => {
          if (phone) await trigger.tap()
          else await trigger.click()
          const option = page.getByRole("option", { name, exact: true })
          await expect(option).toBeVisible()
          return option
        }
        const five = await pick("After 5 minutes")
        if (phone) {
          const drawer = page.getByRole("dialog").filter({ has: five })
          await settled(drawer)
          const box = (await drawer.boundingBox())!
          const view = page.viewportSize()!
          expect(box.width, "a drawer spans the phone").toBeGreaterThan(view.width - 2)
          expect(Math.abs(box.y + box.height - view.height), "a drawer stands on the screen's foot").toBeLessThan(2)
        }
        await expect(page.getByRole("option")).toHaveText(["Right away", "After 1 minute", "After 5 minutes", "After 10 minutes"])
        await reviewShot(page, "push-delay-picker", theme)
        if (phone) await five.tap()
        else await five.click()
        await expect(trigger).toHaveText("After 5 minutes")
        await expect(row).toContainText("Saved")
        expect(sent).toEqual([["/notify.push_delay", { value: 5 }]])

        refuse = true
        const now = await pick("Right away")
        if (phone) await now.tap()
        else await now.click()
        await expect(row).toContainText(`Not saved. ${REFUSED}`)
        await expect(trigger).toHaveText("After 5 minutes")
        expect(sent).toHaveLength(2)
        await reviewShot(page, "push-delay-refused", theme)
      })
    })
  }
}
