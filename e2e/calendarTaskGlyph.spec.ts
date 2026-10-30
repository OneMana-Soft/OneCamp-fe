import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"

// A task on the calendar's week is a block in its project's hue, its status
// glyph in the corner (components/calendar/HueBlock). The glyph sits on the
// block's tint, where its hue's strong cut fell short of the 3:1 a mark needs
// (WCAG 1.4.11): an in-progress sun read 2.44:1 on a lake block (DESIGN-BUILD-22,
// 27 Oct 2026). Measured here as Chromium paints it, at rest and under the
// pointer (a deeper tint), in both themes. With SHOTS_DIR set, the week and one
// block are saved for review.

const NOW = new Date(2026, 9, 19, 8, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()
const STATUSES = ["in_progress", "in_review", "done"] as const
// Three projects, so the blocks come in more than one hue.
const PROJECTS = [1, 2, 3].map((n) => `7a000000-0000-4000-8000-00000000000${n}`)
const TASKS = PROJECTS.flatMap((project_uuid, p) =>
  STATUSES.map((task_status, s) => ({
    task_uuid: `7b000000-0000-4000-8000-0000000000${p}${s}`,
    task_name: `${["Draft", "Review", "Ship"][s]} plan ${p + 1}`,
    task_start_date: at(19 + s * 2, 9 + p * 2),
    task_due_date: at(19 + s * 2, 10 + p * 2),
    task_status,
    task_project: { project_uuid, project_name: `Project ${p + 1}` },
  })),
)

async function openWeek(page: Page, testInfo: TestInfo) {
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: TASKS } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  })
  await page.goto("/app/calendar?date=2026-10-19&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const blocks = page.locator('[data-hue-block="task"]')
  await expect(blocks).toHaveCount(TASKS.length, { timeout: 120_000 })
  return blocks
}

/** A task block's glyph against the block: its hue's paint, faded by what holds it, over the block's fill as painted. */
function contrastOn(block: Locator) {
  return block.evaluate((el) => {
    const glyph = el.querySelector<SVGSVGElement>("[data-status-glyph]")!
    const part = glyph.querySelector<SVGElement>('path:not([fill="none"]), circle:not([fill="none"])')!
    const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
    const rgb = (css: string) => {
      // A colour the canvas can't read leaves its last fill: never measure against that.
      paint.fillStyle = "#010203"
      paint.fillStyle = css
      if (paint.fillStyle === "#010203") throw new Error(`not a colour the canvas paints: ${css}`)
      paint.clearRect(0, 0, 1, 1)
      paint.fillRect(0, 0, 1, 1)
      return [...paint.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    let alpha = 1
    for (let at: Element | null = glyph; at && at !== el; at = at.parentElement) alpha *= Number(getComputedStyle(at).opacity)
    const ground = rgb(getComputedStyle(el).backgroundColor)
    const mark = rgb(getComputedStyle(part).fill).map((c, i) => c * alpha + ground[i] * (1 - alpha))
    const lum = (c: number[]) =>
      c.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const [hi, lo] = [lum(mark), lum(ground)].sort((a, b) => b - a)
    return { status: glyph.getAttribute("data-status-glyph"), hue: el.getAttribute("data-hue"), ratio: (hi + 0.05) / (lo + 0.05) }
  })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a task's status on its block on the week, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme, deviceScaleFactor: 2 })

    test("is a mark at 3:1 on the block's tint, at rest and under the pointer", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      const blocks = await openWeek(page, testInfo)
      for (const block of await blocks.all()) {
        const rest = await contrastOn(block)
        expect(rest.ratio, `${rest.status} on a ${rest.hue} block: ${rest.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
        await block.hover()
        const lit = await contrastOn(block)
        expect(lit.ratio, `${lit.status} on a ${lit.hue} block under the pointer: ${lit.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
      await page.mouse.move(0, 0)
      if (process.env.SHOTS_DIR) {
        await reviewShot(page, "calendar-task-glyphs", theme)
        await blocks.filter({ has: page.locator('[data-status-glyph="progress"]') }).first().screenshot({ path: `${process.env.SHOTS_DIR}/calendar-task-glyph-block-${theme}.png` })
      }
    })
  })
}
