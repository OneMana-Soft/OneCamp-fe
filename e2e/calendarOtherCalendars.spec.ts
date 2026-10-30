import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { stubBackend, withStatus, type Answers } from "./stubbedApp"

// Calendar A6: calendars beside your own. Family (a calendar the move from
// Google made) is listed under My calendars and drawn in its colour; a
// project's calendar and Maya's shared one under Other calendars; hiding
// Family takes its event off the week; Share opens the share dialog, which
// adds a teammate at a level. A phone has the same choices in its calendar
// options. With SHOTS_DIR set, each state is saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()

const CALENDARS = [
  { id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true },
  { id: "cal-fam", name: "Family", kind: "external", hue: "berry", access: "manage", mine: true },
  { id: "cal-launch", name: "Launch", kind: "project", container_kind: "project", container_id: "p-launch", access: "edit" },
  { id: "cal-maya", name: "Maya Chen", kind: "personal", access: "view" },
]

const own = (id: string, title: string, day: number, hour: number, calendar: string) => ({
  event_uuid: id, event_title: title, event_start_time: at(day, hour), event_end_time: at(day, hour + 1), event_calendar_id: calendar,
})

const theirs = (id: string, title: string, day: number, hour: number, calendar: string) => ({
  id, calendar_id: calendar, title, start: { at: at(day, hour) }, end: { at: at(day, hour + 1) }, all_day: false,
})

async function open(page: Page, testInfo: TestInfo, answers: Answers = {}) {
  const shared: { person: { user_uuid: string; user_name: string }; level: string }[] = [{ person: { user_uuid: "u-ria", user_name: "Ria Kapoor" }, level: "details" }]
  const puts: { path: string; body: unknown }[] = []
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [own("e-review", "Design review", 21, 10, "cal-me"), own("e-dentist", "Dentist", 22, 9, "cal-fam")] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [theirs("e-launch", "Launch review", 21, 14, "cal-launch"), theirs("e-maya", "Pricing call", 20, 11, "cal-maya")], truncated: false },
    "/calendar/calendars/cal-me/shares": (url: URL, request: Request) => {
      if (request.method() === "PUT") {
        puts.push({ path: url.pathname, body: request.postDataJSON() })
        return {}
      }
      return { msg: "ok", data: shared }
    },
    "/calendar/calendars": { msg: "ok", data: CALENDARS },
    "/user/searchUserAndChannelList": { msg: "ok", data: [{ type: "user", user_uuid: "u-jonas", user_name: "Jonas Weber" }] },
    ...answers,
  })
  page.on("response", (r) => {
    if (r.status() === 404) console.log(`UNSTUBBED ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  // A dev server compiles the app on its first visit: the week, however long that takes.
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  return puts
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`calendars beside yours at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("an import's calendar, a project's and a teammate's, each shown or hidden, and your calendar shared", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const puts = await open(page, testInfo)
      const week = page.locator("[data-period]")
      await expect(week.getByText("Launch review")).toBeVisible({ timeout: 30_000 })
      await expect(week.getByText("Pricing call")).toBeVisible()
      await expect(week.getByText("Dentist")).toBeVisible()
      await shot(page, "a6-week", theme)

      await page.getByRole("button", { name: /^Calendars/ }).click()
      const panel = page.locator("[data-calendars-panel]")
      await expect(panel.locator("[data-calendar-row='cal-fam']")).toContainText("1 this week")
      // Personal counts its own: not Family's, a project's or a teammate's.
      await expect(panel.locator("[data-calendar-row='onecamp']")).toContainText("1 this week")
      await expect(panel.locator("[data-other-calendars]").getByRole("checkbox", { name: "Launch" })).toBeVisible()
      await expect(panel.locator("[data-other-calendars]").getByRole("checkbox", { name: "Maya Chen" })).toBeVisible()
      await shot(page, "a6-panel", theme)

      // Family hidden: its event leaves the week, and comes back with it.
      await panel.getByRole("checkbox", { name: "Family" }).click()
      await expect(week.getByText("Dentist")).toHaveCount(0)
      await panel.getByRole("checkbox", { name: "Family" }).click()
      await expect(week.getByText("Dentist")).toBeVisible()

      // Share your calendar: Ria sees details already; Jonas is added.
      const personal = panel.locator("[data-calendar-row='onecamp']")
      await personal.hover()
      await personal.getByRole("button", { name: "Personal options" }).click()
      await page.getByRole("menuitem", { name: "Share" }).click()
      const dialog = page.locator("[data-share-dialog='calendar']")
      await expect(dialog.getByRole("heading", { name: "Share your calendar" })).toBeVisible()
      await expect(dialog.getByText("Ria Kapoor")).toBeVisible()
      await dialog.getByRole("combobox", { name: "Add people" }).fill("jo")
      await dialog.getByRole("option", { name: /Jonas Weber/ }).click()
      await shot(page, "a6-share", theme)
      await dialog.getByRole("button", { name: "Invite" }).click()
      await expect.poll(() => puts.map((p) => `${p.path} ${JSON.stringify(p.body)}`)).toContain('/calendar/calendars/cal-me/shares/u-jonas {"level":"details"}')
      await expect(dialog.locator("[data-share-row]").getByText("Jonas Weber")).toBeVisible()
      await shot(page, "a6-shared", theme)
    })
  })
}

// AUDIT-WEB F2 and its follow-up (DESIGN-BUILD-8): a read of the calendars
// beside yours that failed is partial data. Your week stays drawn and live,
// one row above it says their times are missing (never free), and Try again,
// busy in place, reads them.
for (const [width, theme] of [[1280, "light"], [1280, "dark"], [390, "light"], [390, "dark"]] as const) {
  test.describe(`calendars beside yours that couldn't be read, at ${width}, ${theme}`, () => {
    test.use(width === 390 ? { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width, height: 900 }, colorScheme: theme })

    test("your week stays, one row says theirs is missing, and Try again reads them", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      let down = true
      const events = { msg: "ok", data: [theirs("e-launch", "Launch review", 21, 14, "cal-launch")], truncated: false }
      await open(page, testInfo, {
        "/calendar/calendars/events": () => (down ? withStatus(500, { msg: "internal error" }) : events),
      })
      const week = page.locator("[data-period]")
      const row = page.locator("[data-load-failed-row]")
      await expect(row.getByText("Couldn't load the calendars beside yours, so their busy times aren't shown.")).toBeVisible({ timeout: 30_000 })
      await expect(page.locator("[data-calendar-failed]")).toHaveCount(0)
      await expect(week.getByText("Launch review")).toHaveCount(0)
      // In the page's flow, above the grid: never over your events.
      const [r, g] = [await row.boundingBox(), await week.boundingBox()]
      expect(r!.y + r!.height).toBeLessThanOrEqual(g!.y + 1)
      // On a phone the words take two lines at most (18 px each).
      if (width === 390) expect((await row.locator(".notice-text").boundingBox())!.height).toBeLessThanOrEqual(2 * 18 + 4)
      // Your own week is live: its event takes the click.
      await week.getByText("Design review").first().click()
      await page.keyboard.press("Escape")
      await shot(page, "f2-others-failed", theme)

      // Try again holds its place, busy, while the read is asked again.
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route(/\/calendar\/calendars\/events/, async (route) => {
        await gate
        await route.fallback()
      })
      down = false
      await row.getByRole("button", { name: "Try again" }).click()
      await expect(row.getByRole("button", { name: "Try again" })).toHaveAttribute("aria-busy", "true")
      if (width === 1280 && theme === "light") await shot(page, "f2-others-retrying", theme)
      release()
      await expect(week.getByText("Launch review")).toBeVisible({ timeout: 30_000 })
      await expect(row).toHaveCount(0)
    })
  })
}

test.describe("calendars beside yours on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })
  test("the calendar options list them with a switch each, and share your calendar", async ({ page }, testInfo) => {
    test.setTimeout(420_000)
    await open(page, testInfo)
    await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
    // The computer's list under the computer's names: yours (Personal and
    // Assigned tasks too, so a phone can hide them), then others'.
    const mine = page.locator("[data-drawer-calendars]")
    for (const name of ["Personal", "Family", "Assigned tasks"]) await expect(mine.getByRole("switch", { name: `Show ${name}` })).toBeVisible()
    const theirs = page.locator("[data-drawer-other-calendars]")
    for (const name of ["Launch", "Maya Chen"]) await expect(theirs.getByRole("switch", { name: `Show ${name}` })).toBeVisible()
    await expect(page.getByText("My calendars", { exact: true })).toBeVisible()
    await expect(page.getByText("Other calendars", { exact: true })).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
    await shot(page, "a6-drawer", "light")
    // Hiding Assigned tasks here hides them on the calendar too.
    await mine.getByRole("switch", { name: "Show Assigned tasks" }).click()
    await expect(mine.getByRole("switch", { name: "Show Assigned tasks" })).toHaveAttribute("aria-checked", "false")
    await page.getByRole("button", { name: "Share my calendar" }).click()
    await expect(page.locator("[data-share-dialog='calendar']").getByRole("heading", { name: "Share your calendar" })).toBeVisible()
    await shot(page, "a6-share-phone", "light")
  })
})
