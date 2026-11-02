import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { takesAFinger } from "./menuReach"
import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// linear-15 head 2b: the projects overview shows each project's plan (status, priority, lead, labels, target)
// and sorts by it, and the projects timeline draws a project across its plan's dates.
const NOW = new Date("2026-10-29T10:00:00Z")
const id = (n: number) => `9e0a0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const status = (category: string, name: string) => ({ category, name, color: "" })
const base = { is_admin: 1, open: 3, done: 1, overdue: 0, due_soon: 0 }
const PROJECTS = [
  {
    ...base,
    project_uuid: id(1),
    project_name: "Billing revamp",
    project_team: { team_uuid: "t1", team_name: "Payments" },
    // No dated tasks: only its plan puts it on the timeline.
    plan: {
      lead: { user_uuid: "u1", name: "Ana Diaz" },
      start: { date: "2026-10-01", resolution: "quarter" },
      target: { date: "2026-12-01", resolution: "month" },
      priority: "urgent",
      status: status("in_progress", "In progress"),
      labels: [{ id: "l1", name: "Revenue", color: "#16a34a" }],
    },
  },
  {
    ...base,
    project_uuid: id(2),
    project_name: "Audit prep",
    first_day: "2026-10-20",
    last_day: "2026-11-10",
    plan: { lead: null, start: null, target: null, priority: "low", status: status("planned", "Planned"), labels: null },
  },
  {
    ...base,
    project_uuid: id(3),
    project_name: "Mobile app",
    first_day: "2026-09-01",
    last_day: "2026-10-15",
    plan: { lead: { user_uuid: "u2", name: "Ben Ito" }, start: null, target: { date: "2026-09-30", resolution: "day" }, priority: "high", status: status("paused", "Paused"), labels: null },
  },
]
// V-256: next spring's launch, wholly past the timeline's right edge as it opens on today.
const LAUNCH = {
  ...base,
  project_uuid: id(4),
  project_name: "Launch v3",
  plan: {
    lead: null,
    start: { date: "2027-04-01", resolution: "quarter" },
    target: { date: "2027-06-01", resolution: "month" },
    priority: "medium",
    status: status("planned", "Planned"),
    labels: null,
  },
}

async function open(page: Page, testInfo: TestInfo, theme: string, projects: object[] = PROJECTS) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects } },
    "/project/milestones": { msg: "ok", data: { projects: {} } },
    "/project/forecasts": { msg: "ok", data: { forecasts: {} } },
    "/notices": { msg: "ok", data: [] },
    "/goal/list": { msg: "ok", data: { goals: [] } },
  })
  await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["on a laptop", { viewport: { width: 1280, height: 900 }, colorScheme: theme }],
  ] as const) {
    test.describe(`the projects overview by its plans ${where}, ${theme}`, () => {
      test.use(use)
      const phone = where === "on a phone"
      const press = (target: Locator) => (phone ? target.tap() : target.click())
      const rows = (page: Page) => page.locator("[data-project-row]")
      const row = (page: Page, name: string) => rows(page).filter({ hasText: name })

      test("each project shows its plan, and the list sorts by priority and by target date", async ({ page }, testInfo) => {
        await open(page, testInfo, theme)
        const billing = row(page, "Billing revamp")
        await expect(billing.locator("[data-plan-status]")).toHaveAttribute("aria-label", "Status: In progress", { timeout: 60_000 })
        await expect(row(page, "Mobile app").locator("[data-plan-status]")).toHaveAttribute("aria-label", "Status: Paused")
        // Its priority is a task row's glyph alone: named for a screen reader, its word on hover.
        await expect(billing.getByRole("img", { name: "Priority: Urgent" })).toBeVisible()
        await expect(row(page, "Audit prep").locator("[data-plan-priority]")).toHaveAttribute("data-tip", "Low")
        // Its team, lead and labels on a line of their own, a phone's card too (DB-93, 2 Nov).
        await expect(billing.locator("[data-plan-line]")).toHaveText("Payments · Ana Diaz · Revenue")
        await expect(row(page, "Audit prep").locator("[data-plan-line]")).toHaveCount(0)
        if (!phone) {
          await expect(billing.locator("[data-plan-target]")).toHaveText("Dec 2026")
          // A day's target past its day, with work open, is late.
          await expect(row(page, "Mobile app").locator("[data-plan-target]")).toHaveAttribute("title", "Target: 30 Sep 2026")
          await expect(row(page, "Mobile app").locator("[data-plan-target]")).toHaveClass(/text-danger-ink/)
          // V-255: with no target set, its tasks' last day stands in, in quiet ink and titled as what it is.
          const tasksEnd = row(page, "Audit prep").locator("[data-tasks-end]")
          await expect(tasksEnd).toHaveText("10 Nov")
          await expect(tasksEnd).toHaveAttribute("title", "No target set; its tasks end 10 Nov")
          await expect(tasksEnd).toHaveClass(/text-ink-3/)
          await expect(row(page, "Audit prep").locator("[data-plan-target]")).toHaveCount(0)
          // V-257: the Target sort orders by the day the column shows, so a tasks' end of 10 Nov comes before Dec 2026.
          await page.locator("[data-projects-head]").getByRole("button", { name: "Target" }).click()
          await expect(rows(page)).toHaveText([/Mobile app/, /Audit prep/, /Billing revamp/])
        } else {
          // V-255: a phone card names its end after its counts, a late target in danger ink, a tasks' end quiet.
          const mobile = row(page, "Mobile app")
          const end = mobile.locator("[data-plan-target]")
          await expect(end).toHaveText("30 Sep")
          await expect(end).toHaveClass(/text-danger-ink/)
          const [counts, at] = await Promise.all([mobile.locator("[data-row-counts]").boundingBox(), end.boundingBox()])
          expect(at!.x, "the end comes after the counts").toBeGreaterThanOrEqual(counts!.x + counts!.width)
          expect(Math.abs(at!.y + at!.height / 2 - (counts!.y + counts!.height / 2)), "the end shares the counts' line").toBeLessThan(2)
          await expect(row(page, "Audit prep").locator("[data-tasks-end]")).toHaveText("10 Nov")
          await expect(row(page, "Audit prep").locator("[data-tasks-end]")).toHaveClass(/text-ink-3/)
        }
        await press(page.getByRole("button", { name: "Display" }))
        await press(page.getByRole("menuitemradio", { name: "Priority" }))
        await expect(page.getByRole("menuitemradio", { name: "Priority" })).toHaveAttribute("aria-checked", "true")
        await page.keyboard.press("Escape")
        await expect(rows(page)).toHaveText([/Billing revamp/, /Mobile app/, /Audit prep/])
        await reviewShot(page, "projects-plan-overview", theme)
      })

      test("the timeline draws a project across its plan's dates, and from its tasks' days where its plan has none", async ({ page }, testInfo) => {
        await open(page, testInfo, theme)
        await expect(row(page, "Billing revamp")).toBeVisible({ timeout: 60_000 })
        await press(page.getByRole("tab", { name: "Timeline" }))
        // Billing revamp has no dated task: its bar is its plan's, Q4 2026 to the end of December.
        await expect(page.getByRole("link", { name: /^Billing revamp, .*% done/ })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByRole("link", { name: /^Audit prep, .*% done/ })).toBeVisible()
        await expect(page.getByText("No dates yet")).toHaveCount(0)
        // Its lead's face at the bar's end; its lead, priority and labels in its name, the tip under a pointer.
        const bar = page.locator(`[data-project-bar="${id(1)}"]`)
        await expect(bar).toHaveAttribute("aria-label", /, led by Ana Diaz, Urgent priority, labels Revenue, /)
        await expect(bar).toHaveAttribute("data-tip", (await bar.getAttribute("aria-label"))!)
        await expect(bar.locator("xpath=..").locator("[data-plan-lead]")).toBeVisible()
        await expect(page.locator(`[data-project-bar="${id(2)}"]`).locator("xpath=..").locator("[data-plan-lead]")).toHaveCount(0)
        await reviewShot(page, "projects-plan-timeline", theme)
        if (phone) {
          // Nothing hovers on a phone: a tap on the bar, where it shows right of the names, opens its plan in a sheet,
          // and the way on to its timeline is pinned in the sheet's footer.
          const [b, r] = await Promise.all([bar.boundingBox(), page.getByRole("region", { name: "Projects on a timeline" }).boundingBox()])
          const x = Math.min(Math.max(b!.x, r!.x + 140) + 24, b!.x + b!.width - 4, r!.x + r!.width - 4)
          await page.touchscreen.tap(x, b!.y + b!.height / 2)
          const peek = page.locator("[data-plan-peek]")
          await expect(peek).toBeVisible()
          for (const words of ["Billing revamp", "Ana Diaz", "Urgent", "Revenue"]) await expect(peek).toContainText(words)
          await expect(peek.getByRole("link", { name: "Open timeline" })).toBeInViewport({ ratio: 1 })
          await expect(page).toHaveURL(/view=timeline|\/app\/project(\?|$)/)
          await reviewShot(page, "projects-plan-peek", theme)
          await page.keyboard.press("Escape")
          await expect(peek).toHaveCount(0)
        }
      })

      // V-256: a bar wholly out of view is pointed to from the edge it lies past, by its nearest day (in danger ink
      // when late), and a press scrolls it into view. The timeline opens on today: Mobile app (1 to 30 Sep) lies past
      // its left edge and Launch v3 (from 1 Apr 2027) past its right; Billing revamp and Audit prep cross the view.
      test("a bar out of view is pointed to from its edge, and a press brings it into view", async ({ page }, testInfo) => {
        await open(page, testInfo, theme, [...PROJECTS, LAUNCH])
        await expect(row(page, "Launch v3")).toBeVisible({ timeout: 60_000 })
        await press(page.getByRole("tab", { name: "Timeline" }))
        const bar = (n: number) => page.locator(`[data-project-bar="${id(n)}"]`)
        await expect(bar(4)).toBeAttached({ timeout: 30_000 })
        const chip = (n: number, side: "before" | "after") => bar(n).locator("xpath=..").locator(`[data-off-view="${side}"]`)
        // A chip shows by its clip box, the span around it; the button keeps its own box while clipped to nothing.
        const shown = (n: number, side: "before" | "after") => chip(n, side).evaluate((el) => el.parentElement!.getBoundingClientRect().width)
        // In view means across the grid's visible part: the sticky names column (260 px, 140 on a phone) covers
        // the scroller's left, so toBeInViewport would call a bar under the names in view.
        const names = phone ? 140 : 260
        const inView = (n: number) =>
          bar(n).evaluate((el, names) => {
            const scroller = el.closest("[role=region]")!
            const s = scroller.getBoundingClientRect()
            const b = el.getBoundingClientRect()
            return b.right > s.left + names + 1 && b.left < s.left + scroller.clientWidth - 1
          }, names)

        await expect.poll(() => shown(3, "before"), { timeout: 10_000 }).toBeGreaterThan(20)
        await expect(chip(3, "before")).toHaveText("30 Sep")
        await expect(chip(3, "before")).toHaveClass(/text-danger-ink/)
        await expect.poll(() => shown(4, "after")).toBeGreaterThan(20)
        await expect(chip(4, "after")).toHaveText("1 Apr 2027")
        await expect(chip(4, "after")).toHaveClass(/text-ink-2/)
        for (const [n, side] of [[3, "after"], [4, "before"], [1, "before"], [1, "after"], [2, "before"], [2, "after"]] as const) {
          expect(await shown(n, side), `project ${n}'s ${side} chip`).toBe(0)
        }
        expect(await inView(3)).toBe(false)
        expect(await inView(4)).toBe(false)
        if (phone) {
          expect(await takesAFinger(chip(3, "before")), "the left chip takes a finger").toBe(true)
          expect(await takesAFinger(chip(4, "after")), "the right chip takes a finger").toBe(true)
        }
        await reviewShot(page, "projects-plan-offview", theme)

        // Launch v3's chip brings its start into view; the bars now behind the view are pointed to from the left.
        await press(chip(4, "after"))
        await expect.poll(() => inView(4), { timeout: 10_000 }).toBe(true)
        await expect.poll(() => shown(4, "after")).toBe(0)
        await expect.poll(() => shown(1, "before")).toBeGreaterThan(20)
        await expect(chip(1, "before")).toHaveText("31 Dec")

        // Mobile app's chip brings its end back into view, and its chip goes.
        await press(chip(3, "before"))
        await expect.poll(() => inView(3), { timeout: 10_000 }).toBe(true)
        await expect.poll(() => shown(3, "before")).toBe(0)
      })
    })
  }
}
