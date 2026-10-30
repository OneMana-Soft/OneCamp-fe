import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { scrollsInItsBody } from "./sheetLayout"
import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// Calendar A4: Import and export, from the Calendars panel. A Google export
// zip goes in as a job into the calendar, and the dialog says what came in,
// what was there already and what was left out; Download .ics asks for every
// event. With SHOTS_DIR set, each state is saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)

const job = (patch: Record<string, unknown>) => ({ id: "job-1", kind: "import", format: "ics", status: "queued", progress: 0, created_at: NOW.toISOString(), ...patch })

async function open(page: Page, testInfo: TestInfo) {
  const asked: { path: string; form?: string }[] = []
  let polls = 0
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/doc/import": (url: URL, request: Request) => {
      asked.push({ path: url.pathname, form: request.postData() ?? "" })
      return { job: job({ filename: "takeout.zip" }) }
    },
    "/content-io/jobs/": () => {
      polls++
      return {
        job: polls < 2 ? job({ status: "running", progress: 45, filename: "takeout.zip" }) : job({
          status: "done", progress: 100, filename: "takeout.zip", unchanged: 3,
          created: Array.from({ length: 100 }, (_, i) => ({ kind: "event", uuid: `e${i}`, title: `Event ${i}` })),
          made: 128,
          into: [{ uuid: "cal-me", kind: "personal", title: "Personal", count: 96 }, { uuid: "cal-family", kind: "external", title: "Family", count: 32 }],
          show: { uuid: "e3", title: "Offsite", at: "2026-11-05" },
          skipped: [{ what: "Buy milk", why: "Only events come across, not to-dos." }, { what: "Weekly sync", why: "It was cancelled." }],
        }),
      }
    },
    "/calendar/events/export": () => {
      asked.push({ path: "/calendar/events/export" })
      return "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"
    },
  })
  page.on("response", (r) => {
    if (r.status() === 404) console.log(`UNSTUBBED ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  // A dev server compiles the app on its first visit: the week, however long that takes.
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  return asked
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

async function openDialog(page: Page, phone = false) {
  if (phone) {
    // A phone has the calendar's options in a drawer.
    await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
    await page.getByRole("button", { name: "Import and export" }).click()
  } else {
    await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
    await page.getByRole("button", { name: "Import and export" }).click()
  }
  const dialog = page.locator("[data-calendar-import-export]")
  await expect(dialog).toBeVisible()
  return dialog
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`calendar import and export at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("a Google export comes in, says what it brought, and the calendar exports", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const asked = await open(page, testInfo)
      const dialog = await openDialog(page)
      await shot(page, "import-open", theme)
      await dialog.locator("[data-import-input]").setInputFiles({ name: "takeout.zip", mimeType: "application/zip", buffer: Buffer.from("PK") })
      await dialog.getByRole("button", { name: "Import" }).click()
      await expect.poll(() => asked.find((a) => a.path === "/doc/import")?.form ?? "").toContain('name="into"')
      const made = dialog.locator("[data-events-made]")
      await expect(made).toContainText("128 events came in · 3 were already here", { timeout: 20_000 })
      await expect(made.locator("[data-into]")).toHaveText(["Personal· 96", "Family· 32"])
      await expect(made.getByText("Left out (2)")).toBeVisible()
      await expect(made.getByText("Buy milk")).toBeHidden()
      await shot(page, "import-done", theme)
      const download = page.waitForEvent("download")
      await dialog.getByRole("button", { name: /Download .ics/ }).click()
      expect((await download).suggestedFilename()).toBe("OneCamp calendar.ics")
      // Show them: the week of the next event that came, the dialog closed.
      await dialog.getByRole("button", { name: "Show them" }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.locator("[data-period-title]").first()).toContainText("2 – 8 Nov")
    })
  })
}

test.describe("calendar import and export on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })
  test("the dialog fits a phone, its actions in reach", async ({ page }, testInfo) => {
    test.setTimeout(420_000)
    await open(page, testInfo)
    const dialog = await openDialog(page, true)
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
    await expect(dialog.getByRole("button", { name: /Download .ics/ })).toBeInViewport()
    await shot(page, "import-open", "light")
  })
})

// A short screen, after an import that left things out: the dialog scrolls in its body, and its title, its close
// and its actions stay put.
for (const theme of SHOT_THEMES) {
  for (const phone of [false, true]) {
    test.describe(`calendar import and export on a short screen ${phone ? "on a phone" : "at 1280"}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })
      test("scrolls in its body, its title, close and actions in place", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        await open(page, testInfo)
        const dialog = await openDialog(page, phone)
        await dialog.locator("[data-import-input]").setInputFiles({ name: "takeout.zip", mimeType: "application/zip", buffer: Buffer.from("PK") })
        await dialog.getByRole("button", { name: "Import" }).click()
        await expect(dialog.locator("[data-events-made]")).toContainText("128 events came in", { timeout: 20_000 })
        await reviewShot(page, "c5d-import-done", theme)
        await scrollsInItsBody(page, dialog)
        await reviewShot(page, "c5d-import-end", theme)
      })
    })
  }
}
