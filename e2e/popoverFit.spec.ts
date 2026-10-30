import { expect, test } from "@playwright/test"

import { edgesOf } from "./boxes"
import { expectReachable } from "./menuReach"
import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// The shared PopoverContent stays inside the room the window leaves it (V-43b's
// design review and main's ruling, 29 Oct 2026): at most that room, 16 px short
// of the window's edge, and what is more scrolls inside it. Before, a popover
// taller than the room under its button ran off the screen with its last
// actions: View options (about 330 px tall) on a window 420 px high, as Your
// week made it about 565 px tall on a 1280x720 laptop. The flush-right half,
// 16 px from every edge, is e2e/tables/popoverEdge.spec.ts.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const HEIGHT = 420
const EDGE = 16

for (const theme of SHOT_THEMES) {
  test.describe(`a popover taller than the room under its button, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: HEIGHT }, colorScheme: theme })

    test("View options stays inside the window, and Copy link and Print can be reached", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await page.clock.setFixedTime(NOW)
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("oc_keys_tip_seen", "1")
          localStorage.setItem("ui-theme", t)
        } catch {
          /* storage blocked */
        }
      }, theme)
      await stubBackend(page, testInfo, {
        "/event/getEvents": { msg: "ok", data: [] },
        "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
        "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
        "/event/bookingPages": { msg: "ok", data: [] },
      })
      await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await page.locator("[data-calendar-header]").getByRole("button", { name: "View options" }).click()
      const panel = page.locator('[data-overlay="float"][data-state="open"]').last()
      await expect(panel.getByRole("button", { name: "Print" })).toBeAttached({ timeout: 30_000 })
      await reviewShot(page, "popover-view-options-short-window", theme)
      expect((await edgesOf(panel)).bottom, "its foot keeps 16 px from the window's").toBeGreaterThanOrEqual(EDGE)
      for (const name of ["Copy link to this view", "Print"]) {
        const button = panel.getByRole("button", { name })
        await button.scrollIntoViewIfNeeded()
        await expectReachable(button)
      }
    })
  })
}
