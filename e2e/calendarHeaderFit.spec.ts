import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { boxOf, edgesOf } from "./boxes"
import { holdChunk } from "./holdChunk"
import { expectReachable } from "./menuReach"
import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// The calendar's header at the widths it is drawn (V-43, 28 Oct 2026): the
// period and its steps on the left, the actions on the right, and never one
// over the other. With an event's panel open at 1280 the header is about 570 px
// wide, and the Calendars button sat over the "y" of Today, light and dark.

// The weeks it is read on, 10:00 on the browser's clock: a title within one
// month, and the longest a week's title gets, across two months and across
// two years. Beside the panel, "26 Oct – 1 Nov" was cut short on the live demo
// when only the first was tested (V-43b, 29 Oct 2026).
const WEEKS = [
  { name: "a week within a month", now: new Date(2026, 9, 21, 10, 0) },
  { name: "a week across two months", now: new Date(2026, 9, 29, 10, 0) },
  { name: "a week across two years", now: new Date(2026, 11, 31, 10, 0) },
]
type Week = (typeof WEEKS)[number]
const EVENT = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c43"
const eventOn = (day: Date) => ({
  event_uuid: EVENT,
  event_title: "Launch review",
  event_start_time: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14).toISOString(),
  event_end_time: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15).toISOString(),
  event_created_by: SAM,
  event_participants: [],
  event_reminders: [10],
  event_reminders_default: true,
})
// A quiet week, as the server reads one: Your week shows it in View options beside the panel.
const YOUR_WEEK = {
  meeting_minutes: 60, one_on_one_minutes: 0, group_minutes: 60, meetings: 1, average_meeting_minutes: 60,
  focus_minutes: 0, own_minutes: 0, away_minutes: 0, has_hours: true, working_minutes: 2400, free_minutes: 2340,
  to_answer: 0, usual_meeting_minutes: 60, people: [],
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

async function openWeek(page: Page, testInfo: TestInfo, { now }: Week) {
  const event = eventOn(now)
  await page.clock.setFixedTime(now)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [event] },
    "/event/getEvent/": { msg: "ok", data: event },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    // Your week, which View options shows while its button gives the title room (V-43b).
    "/calendar/insights": { msg: "ok", data: YOUR_WEEK },
    "/calendar/repeats": { msg: "ok", data: { checkins: [], tasks: [] } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  })
  await page.goto(`/app/calendar?date=${ymd(now)}&view=week`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${EVENT}"]`).first()).toBeVisible({ timeout: 60_000 })
}

/**
 * The header as its two sides: where the period's side ends (its title and
 * buttons), where the actions start and end, and the title: its width, and
 * whether the form it shows (components/common/FitLabel) is cut short.
 */
function sides(page: Page) {
  return page.locator("[data-calendar-header]").evaluate((header) => {
    const boxes = (el: Element | undefined) =>
      Array.from(el?.querySelectorAll("button, [data-period-title]") ?? [])
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
    const [period, actions] = Array.from(header.children)
    const p = boxes(period)
    const a = boxes(actions)
    const box = header.getBoundingClientRect()
    // The shown form is the label's first text, or its first span's (a shortened form).
    const title = header.querySelector("[data-period-title]")
    const first = title?.firstChild
    const text = first?.nodeType === Node.TEXT_NODE ? first : first?.firstChild
    const range = document.createRange()
    if (text) range.selectNodeContents(text)
    const titleWidth = title?.getBoundingClientRect().width ?? 0
    return {
      width: Math.round(box.width),
      periodEnd: Math.round(Math.max(...p.map((r) => r.right))),
      actionsStart: Math.round(Math.min(...a.map((r) => r.left))),
      actionsEnd: Math.round(Math.max(...a.map((r) => r.right))),
      headerEnd: Math.round(box.right),
      title: Math.round(titleWidth),
      cut: !text || range.getBoundingClientRect().width > titleWidth + 0.5,
    }
  })
}

type Sides = Awaited<ReturnType<typeof sides>>
const fits = (s: Sides) => s.periodEnd <= s.actionsStart - 4 && s.actionsEnd <= s.headerEnd

for (const theme of SHOT_THEMES) {
  test.describe(`the calendar's header, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    for (const week of WEEKS) {
      test(`with an event's panel open at 1280 on ${week.name}, Today and the actions keep apart, and the period shows`, async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await openWeek(page, testInfo, week)
        await page.locator(`[data-event-uuid="${EVENT}"]`).first().click()
        await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
        await expect(page.getByRole("button", { name: "Edit event" })).toBeVisible({ timeout: 20_000 })
        await expect.poll(async () => (await sides(page)).width, { message: "the header narrows beside the panel" }).toBeLessThan(700)
        const s = await sides(page)
        console.log(`V43 panel ${JSON.stringify(s)}`)
        expect(fits(s), `the header's sides overlap: ${JSON.stringify(s)}`).toBe(true)
        expect(s.cut, `the period's title is cut short: ${JSON.stringify(s)}`).toBe(false)
        await reviewShot(page, `calendar-header-panel-${ymd(week.now)}`, theme)
        // Your week gave its room to the title (V-43b): it is in View options while its button is out of sight.
        const header = page.locator("[data-calendar-header]")
        await expect(header.getByRole("button", { name: "Your week" })).toBeHidden()
        await header.getByRole("button", { name: "View options" }).click()
        await expect(page.locator("[data-view-options] [data-your-week]")).toBeVisible({ timeout: 20_000 })
        await reviewShot(page, `calendar-view-options-your-week-${ymd(week.now)}`, theme)
      })
    }
  })
}

// View options while its code loads (V-56, DB-29's should-fix on V-43b): the
// placeholder was 260 px tall against a view of about 565 px with Your week on
// top, so the popover grew as it loaded. The placeholder's height comes from
// the decision that puts Your week in it, which the calendar makes at open.
test.describe("View options while its code loads", () => {
  test.use({ viewport: { width: 1280, height: 860 }, colorScheme: "light" })

  for (const withWeek of [false, true]) {
    test(`keeps the popover's height ${withWeek ? "with" : "without"} Your week on top`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // The view's own chunk: its root's attribute, not the trigger's (data-view-options-trigger).
      const code = await holdChunk(page, /"data-view-options":/)
      await openWeek(page, testInfo, WEEKS[0])
      const header = page.locator("[data-calendar-header]")
      if (withWeek) {
        await page.locator(`[data-event-uuid="${EVENT}"]`).first().click()
        await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
        await expect(page.getByRole("button", { name: "Edit event" })).toBeVisible({ timeout: 20_000 })
        await expect(header.getByRole("button", { name: "Your week" })).toBeHidden()
      }
      await header.getByRole("button", { name: "View options" }).click()
      await expect.poll(() => code.asked(), { message: "the view's code is asked for" }).toBe(true)
      const pop = page.locator("[data-radix-popper-content-wrapper]").last()
      const loading = await boxOf(pop)
      code.release()
      await expect(page.locator("[data-view-options]")).toBeVisible({ timeout: 20_000 })
      if (withWeek) await expect(page.locator("[data-view-options] [data-your-week]")).toBeVisible({ timeout: 20_000 })
      const loaded = await boxOf(pop)
      console.log(`V56 ${withWeek ? "with" : "without"} Your week: loading ${loading.height}, loaded ${loaded.height}`)
      expect(Math.abs(loaded.height - loading.height), `the popover while its code loads (${loading.height} px) and loaded (${loaded.height} px)`).toBeLessThanOrEqual(2)
      await code.done()
    })
  }
})

// View options on a laptop (V-43b's design review): with Your week on top it
// is about 565 px tall, so on a 1280x720 window, and a 1280x600 one, its last
// actions fell below the window, out of reach. It keeps to the room the window
// leaves it, 16 px short of its edge (the shared PopoverContent), and its
// choices scroll while the link and Print stay in view under them.
for (const height of [720, 600]) {
  for (const theme of SHOT_THEMES) {
    test.describe(`View options with Your week at 1280x${height}, ${theme}`, () => {
      test.use({ viewport: { width: 1280, height }, colorScheme: theme })

      test("stays inside the window, and Copy link and Print can be reached", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await openWeek(page, testInfo, WEEKS[1])
        await page.locator(`[data-event-uuid="${EVENT}"]`).first().click()
        await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
        await expect(page.getByRole("button", { name: "Edit event" })).toBeVisible({ timeout: 20_000 })
        await page.locator("[data-calendar-header]").getByRole("button", { name: "View options" }).click()
        await expect(page.locator("[data-view-options] [data-your-week]")).toBeVisible({ timeout: 20_000 })
        await reviewShot(page, `calendar-view-options-panel-1280x${height}`, theme)
        const options = page.locator('[data-overlay="float"][data-state="open"]').last()
        expect((await edgesOf(options)).bottom, "its foot keeps 16 px from the window's").toBeGreaterThanOrEqual(16)
        // In view as they are: the footer stays while the choices scroll.
        for (const name of ["Copy link to this view", "Print"]) await expectReachable(options.getByRole("button", { name }))
        await reviewShot(page, `calendar-view-options-panel-1280x${height}-print`, theme)
      })
    })
  }
}

test.describe("the calendar's header, at each width", () => {
  test.use({ viewport: { width: 1440, height: 860 } })

  for (const week of WEEKS) {
    test(`keeps its sides apart, and the period's title whole, from 820 to 1440 px wide, on ${week.name}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openWeek(page, testInfo, week)
      const seen: Array<{ at: number } & Sides> = []
      // Every 8 px: a width just past one of the header's steps (a word coming back) is where the title runs short.
      for (let at = 1440; at >= 820; at -= 8) {
        await page.setViewportSize({ width: at, height: 860 })
        // Settled: two reads alike, once the container's rules and the title's fit have run.
        let last = ""
        await expect
          .poll(async () => {
            const now = JSON.stringify(await sides(page))
            const same = now === last
            last = now
            return same
          })
          .toBe(true)
        seen.push({ at, ...(JSON.parse(last) as Sides) })
      }
      console.log(`V43 widths ${ymd(week.now)} ${JSON.stringify(seen)}`)
      expect(seen.filter((s) => !fits(s)), "widths where the header's sides overlap").toEqual([])
      expect(seen.filter((s) => s.cut), "widths where the period's title is cut short").toEqual([])
    })
  }
})
