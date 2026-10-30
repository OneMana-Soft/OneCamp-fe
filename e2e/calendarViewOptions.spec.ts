import { writeFileSync } from "node:fs"
import { constants, inflateSync } from "node:zlib"
import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"

// B1's View options (gcal-2): Google's custom view and its view settings by
// the switch. A length chosen there shows at once and is kept with the view
// in the address; the density, the weekend and week numbers are kept on this
// device. With SHOTS_DIR set, the options and each density are saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)
const on21 = (hour: number, min = 0) => new Date(2026, 9, 21, hour, min).toISOString()
/** A half hour and an hour on the 21st, to see what each density says on a block. */
const MEETINGS = [
  { event_uuid: "e-standup", event_title: "Standup", event_start_time: on21(9), event_end_time: on21(9, 30) },
  { event_uuid: "e-review", event_title: "Design review", event_start_time: on21(14), event_end_time: on21(15) },
]

async function open(page: Page, testInfo: TestInfo, at = "/app/calendar?date=2026-10-21&view=week", events: object[] = []) {
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: events },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  })
  await page.goto(at, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
}


/** The hour as the week draws it: its 24 hours' column measured. */
const hourOf = (page: Page) => page.locator('[data-day-col="0"]').evaluate((el) => el.getBoundingClientRect().height / 24)

test("a custom length, the weekend and week numbers, from View options", async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  await open(page, testInfo)
  await page.getByRole("button", { name: "View options" }).click()
  await page.getByRole("radiogroup", { name: "Custom view in days" }).getByRole("radio", { name: "5" }).click()
  await expect(page.getByRole("button", { name: "Next 5 days" })).toBeVisible()
  await expect(page.locator("[data-period]")).toHaveAttribute("data-period", "custom:2026-10-21")
  await expect(page.getByRole("button", { name: "View options", pressed: true })).toContainText("5 days")
  // Chosen and open are states, not actions: the trigger's icon and words are
  // ink, never the accent (design review, 22 Oct).
  const tone = await page.locator("[data-view-options-trigger]").evaluate((el) => {
    const probe = document.body.appendChild(document.createElement("i"))
    const resolve = (v: string) => ((probe.style.color = v), getComputedStyle(probe).color)
    const out = { open: el.getAttribute("data-state"), icon: getComputedStyle(el.querySelector("svg")!).color, words: getComputedStyle(el).color, ink: resolve("var(--ink)"), brand: resolve("var(--brand)") }
    probe.remove()
    return out
  })
  expect(tone.open).toBe("open")
  expect([tone.icon, tone.words]).toEqual([tone.ink, tone.ink])

  await page.getByRole("switch", { name: "Show weekends" }).click()
  await page.getByRole("switch", { name: "Week numbers" }).click()
  // Five weekdays from Wednesday: Wed, Thu, Fri, then Mon and Tue.
  await expect(page.locator("[data-weekend]")).toHaveCount(0)
  await expect(page.locator("[data-week-number]").first()).toHaveText(/^W\d+$/)
  await reviewShot(page, "view-options", "light")

  // The view and its length are in the address; the layout is this device's.
  await page.keyboard.press("Escape")
  await expect.poll(() => new URL(page.url()).searchParams.get("span"), { timeout: 10_000 }).toBe("5d")
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByRole("button", { name: "Next 5 days" })).toBeVisible({ timeout: 120_000 })
  await expect(page.locator("[data-weekend]")).toHaveCount(0)
})

test("X opens the custom view and J steps it by its length", async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  await open(page, testInfo)
  await page.keyboard.press("x")
  await expect(page.locator("[data-period]")).toHaveAttribute("data-period", "custom:2026-10-21")
  await page.keyboard.press("j")
  await expect(page.locator("[data-period]")).toHaveAttribute("data-period", "custom:2026-10-25")
})

test.describe("density", () => {
  // Taller than Playwright's 720, so fit's hour isn't roomy's 56 by chance.
  test.use({ viewport: { width: 1280, height: 900 } })

  test("compact draws more of the day, and fit fills the screen with the working day", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await open(page, testInfo, undefined, MEETINGS)
    const standup = page.locator('[data-hue-block][data-event-uuid="e-standup"]')
    await expect(standup).toBeVisible({ timeout: 30_000 })
    expect(await hourOf(page)).toBe(56)
    await page.getByRole("button", { name: "View options" }).click()
    const density = page.getByRole("radiogroup", { name: "Density" })
    await density.getByRole("radio", { name: "Compact" }).click()
    await expect.poll(() => hourOf(page)).toBe(40)
    // A half hour, 18 px tall now, says its title and start on one line.
    await expect(standup.locator(".cal-block-at")).toBeVisible()
    await expect(standup.locator(".cal-block-when")).toBeHidden()
    // An hour, 40 px tall now, says its title over its time, and the time is
    // one fact: whole on its line, never "2:…".
    const review = page.locator('[data-hue-block][data-event-uuid="e-review"]')
    await expect(review.locator(".cal-block-at")).toBeHidden()
    const time = await review.locator(".cal-block-when").evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const t = range.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      return { shown: t.width > 0, inside: t.left >= b.left - 0.5 && t.right <= b.right + 0.5 && t.top >= b.top - 0.5 && t.bottom <= b.bottom + 0.5 }
    })
    expect(time).toEqual({ shown: true, inside: true })
    await reviewShot(page, "density-compact", "light")

    await density.getByRole("radio", { name: "Fit" }).click()
    // The working day fills the scroller: 9 AM 8 px under its top, 6 PM just over its foot.
    const fit = () =>
      page.evaluate(() => {
        const scroller = document.querySelector("[data-time-grid-scroll]") as HTMLElement
        const view = scroller.getBoundingClientRect()
        const grid = document.querySelector('[data-day-col="0"]')!.getBoundingClientRect()
        const hour = grid.height / 24
        return { hour, room: scroller.clientHeight, nine: Math.round(grid.top + 9 * hour - view.top), six: Math.round(view.bottom - (grid.top + 18 * hour)) }
      })
    await expect.poll(async () => (await fit()).nine).toBe(8)
    const { hour, room, six } = await fit()
    // The working day's nine hours in the scroller, 8 px clear of each edge, a whole px an hour.
    expect(hour).toBe(Math.min(144, Math.max(40, Math.floor((room - 16) / 9))))
    expect(hour).toBeGreaterThan(56)
    expect(six).toBeGreaterThanOrEqual(8)
    expect(six).toBeLessThan(8 + 9)
    // An hour's meeting has the room for its title over its time.
    await expect(page.locator('[data-event-uuid="e-review"] .cal-block-when')).toBeVisible()
    await reviewShot(page, "density-fit", "light")

    // Kept on this device: the next visit opens on the working day too.
    await page.keyboard.press("Escape")
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(standup).toBeVisible({ timeout: 120_000 })
    await expect.poll(async () => (await fit()).nine).toBe(8)
  })
})

test.describe("the view options on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })

  test("are the calendar options' View rows, a finger's size, and change the day at once", async ({ page }, testInfo) => {
    test.setTimeout(420_000)
    // A custom view shows as its day on a phone.
    await open(page, testInfo, "/app/calendar?date=2026-10-21&view=custom&span=4d", MEETINGS)
    await expect(page.locator("[data-period]")).toHaveAttribute("data-period", "day:2026-10-21")
    await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
    const rows = page.locator("[data-drawer-view-options]")
    const density = rows.getByRole("radiogroup", { name: "Density" })
    await density.scrollIntoViewIfNeeded()
    for (const name of ["Density", "Show weekends", "Week numbers", "Week starts on"]) {
      const row = rows.locator("[data-view-option-rows] > div").filter({ hasText: name })
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    // The switches apply as they're flipped, so the footer closes the sheet and says so: Done, not Cancel.
    const sheet = page.getByRole("dialog")
    await expect(sheet.getByRole("button", { name: "Done", exact: true })).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0)
    await reviewShot(page, "view-options-phone", "light")
    await density.getByRole("radio", { name: "Compact" }).tap()
    await expect(density.getByRole("radio", { name: "Compact" })).toHaveAttribute("aria-checked", "true")
    await page.keyboard.press("Escape")
    await expect.poll(() => hourOf(page)).toBe(40)
    await reviewShot(page, "density-compact-phone", "light")
  })
})

/**
 * The colours a PDF fills a whole page with, as "r g b". Chrome paints each
 * page's canvas (margins included) as one rectangle of the page's size, in
 * its own content stream: in a dark colour scheme, Chrome's dark canvas.
 */
const pageFills = (pdf: Buffer): string[] => {
  const out: string[] = []
  const text = pdf.toString("latin1")
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length
    let body: string
    try {
      body = inflateSync(pdf.subarray(start, text.indexOf("endstream", start)), { finishFlush: constants.Z_SYNC_FLUSH }).toString("latin1")
    } catch {
      continue
    }
    // A4 is 794 x 1123 px and Letter 816 x 1056 at 96 dpi; Chrome rounds them.
    for (const f of body.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg(?:\s+\/\w+ gs)?\s+0 0 ([\d.]+) ([\d.]+) re\s+f/g)) {
      const [w, h] = [Number(f[4]), Number(f[5])]
      if ((Math.abs(w - 794) < 3 && Math.abs(h - 1123) < 3) || (Math.abs(w - 816) < 3 && Math.abs(h - 1056) < 3)) out.push(f.slice(1, 4).map((v) => String(Number(v))).join(" "))
    }
  }
  return out
}

/** A PDF's pages, as its page objects count them. */
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length

test.describe("printing the calendar", () => {
  test.use({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" })

  test("prints a week alone on one page, on paper, with every hour", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await open(page, testInfo, undefined, MEETINGS)
    await expect(page.locator('[data-hue-block][data-event-uuid="e-review"]')).toBeVisible({ timeout: 30_000 })
    await page.emulateMedia({ media: "print" })
    // Alone: no sidebar and no controls; the period's title stays.
    await expect(page.locator('aside[aria-label="Sidebar"]')).toBeHidden()
    await expect(page.getByRole("button", { name: "View options" })).toBeHidden()
    await expect(page.locator("[data-period-title]")).toBeVisible()
    // Every hour, none scrolled away, 7.5 mm an hour, and paper in a dark theme.
    const printed = await page.evaluate(() => {
      const scroller = document.querySelector("[data-time-grid-scroll]") as HTMLElement
      const day = document.querySelector('[data-day-col="0"]')!.getBoundingClientRect()
      // The colour --sheet resolves to: a built stylesheet writes #FFFFFF as #fff.
      const probe = document.body.appendChild(document.createElement("i"))
      probe.style.color = "var(--sheet)"
      const sheet = getComputedStyle(probe).color
      probe.remove()
      return { hidden: scroller.scrollHeight - scroller.clientHeight, hour: day.height / 24, sheet }
    })
    expect(printed.hidden).toBeLessThanOrEqual(1)
    expect(printed.hour).toBeCloseTo((7.5 / 25.4) * 96, 0)
    expect(printed.sheet).toBe("rgb(255, 255, 255)")
    // Paper in a dark theme (design review, 22 Oct): no glow from the frame,
    // every hour labelled (the one beside now included), no weekend or
    // off-hours shade, and an event in its light tint, not the dark theme's.
    const paper = await page.evaluate(() => {
      const hours = [...document.querySelectorAll<HTMLElement>("[data-calendar] span")].filter((s) => /^(\d{1,2}\s(AM|PM)|\d{2}:00)$/.test(s.textContent ?? ""))
      const fill = getComputedStyle(document.querySelector('[data-hue-block][data-event-uuid="e-review"]')!).backgroundColor
      return {
        // The frame around the calendar: a demo build's splash is an .app-frame of its own, first in the page.
        glow: getComputedStyle(document.querySelector("[data-calendar]")!.closest(".app-frame")!, "::before").display,
        // Drawn on paper: visible, and with a box (the now line, and its pill, print as nothing).
        hours: hours.filter((s) => getComputedStyle(s).visibility === "visible" && s.getClientRects().length > 0).length,
        shaded: [...document.querySelectorAll("[data-calendar] [data-weekend], [data-calendar] [data-off-hours]")].filter((el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)").length,
        // As drawn, in sRGB bytes: a colour-mix fill reads back as oklab(), not rgb().
        darkest: (() => {
          const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d")!
          ctx.fillStyle = fill
          ctx.fillRect(0, 0, 1, 1)
          return Math.min(...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
        })(),
      }
    })
    expect(paper.glow).toBe("none")
    expect(paper.hours).toBe(23)
    expect(paper.shaded).toBe(0)
    expect(paper.darkest, "the event's fill, a light tint").toBeGreaterThan(200)
    await reviewShot(page, "print-week", "dark")
    for (const format of ["A4", "Letter"] as const) {
      const pdf = await page.pdf({ format, printBackground: true })
      if (process.env.SHOTS_DIR) writeFileSync(`${process.env.SHOTS_DIR}/print-week-${format}.pdf`, pdf)
      expect(pages(pdf), `the week on ${format}`).toBe(1)
      // White edge to edge: the page's own fill, margins included, is never the dark canvas.
      expect(pageFills(pdf).filter((c) => c !== "1 1 1"), `the page's fill on ${format}`).toEqual([])
    }
  })

  test("prints a month alone on one page, every bar's time and title whole", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await open(page, testInfo, "/app/calendar?date=2026-10-21&view=month", MEETINGS)
    await expect(page.locator("[data-month-grid]")).toBeVisible({ timeout: 60_000 })
    await page.emulateMedia({ media: "print" })
    // A4's width at 96 dpi, the width page.pdf lays the month out at.
    await page.setViewportSize({ width: 794, height: 1123 })
    const bars = page.locator('[data-month-grid] [aria-label^="Event: "]')
    expect(await bars.count()).toBeGreaterThan(0)
    // DESIGN-BUILD-6's must-fix (22 Oct): "9am Stand…". Nothing in a bar is cut, across or down.
    const cut = await bars.evaluateAll((all) =>
      all.flatMap((bar) => [bar, ...bar.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(() => bar.textContent)),
    )
    expect(cut, "bars whose words are cut in print").toEqual([])
    // DESIGN-BUILD-22's must-fix (27 Oct): each bar's colour strip sits on its bar, never at the page's edge.
    const strays = await bars.evaluateAll((all) =>
      all.flatMap((bar) => {
        const strip = bar.querySelector("[data-hue-bar]")
        if (!strip) return []
        const b = bar.getBoundingClientRect()
        const s = strip.getBoundingClientRect()
        return s.left >= b.left - 0.5 && s.right <= b.right + 0.5 && s.top >= b.top - 0.5 && s.bottom <= b.bottom + 0.5 ? [] : [bar.textContent]
      }),
    )
    expect(strays, "bars whose colour strip is off the bar in print").toEqual([])
    await reviewShot(page, "print-month", "dark")
    const pdf = await page.pdf({ format: "A4", printBackground: true })
    if (process.env.SHOTS_DIR) writeFileSync(`${process.env.SHOTS_DIR}/print-month-A4.pdf`, pdf)
    expect(pages(pdf)).toBe(1)
    expect(pageFills(pdf).filter((c) => c !== "1 1 1")).toEqual([])
  })
})

// DESIGN-BUILD-5's must-fix (22 Oct): the empty week, month and agenda drew
// their spot in berry, calls' hue, the spot's old default. They are in the
// calendar's own hue (areaHue("calendar"), sun), in either theme.
for (const theme of ["light", "dark"] as const) {
  test.describe(`the calendar with nothing on it, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("a free week draws its spot in the calendar's hue", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await open(page, testInfo)
      const spot = page.locator("[data-calendar] svg[data-spot]").first()
      await expect(spot).toBeVisible({ timeout: 30_000 })
      await expect(spot).toHaveClass(/\bhue-sun\b/)
      await reviewShot(page, "week-empty", theme)
    })
  })
}

test.describe("the phone's agenda with nothing coming up", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })

  test("draws its spot in the calendar's hue", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await open(page, testInfo, "/app/calendar?date=2026-10-21&view=agenda")
    const spot = page.locator("[data-calendar] svg[data-spot]").first()
    await expect(spot).toBeVisible({ timeout: 30_000 })
    await expect(spot).toHaveClass(/\bhue-sun\b/)
    await reviewShot(page, "agenda-empty-phone", "light")
  })
})
