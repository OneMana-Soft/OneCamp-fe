import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// Calendar B1, with FLUIDITY-LEAD's drag budget: a drag draws only the block
// it carries. Carried to another day, the block stays the element pressed,
// drawn over the day it would land on, with its place dashed where it was;
// let go, its new times are sent. A resize stretches it where it is. With
// SHOTS_DIR set, the carried and the stretched block are saved for review.

const NOW = new Date(2026, 9, 19, 8, 0)
const at = (day: number, hour: number, min = 0) => new Date(2026, 9, day, hour, min).toISOString()

async function open(page: Page, testInfo: TestInfo, view: "week" | "day" = "week") {
  const sent: { startTime?: string; endTime?: string }[] = []
  // The server's copy: a saved move is what the calendar reads again after it.
  const events = [
    { event_uuid: "e-review", event_title: "Design review", event_start_time: at(19, 10), event_end_time: at(19, 11) },
    { event_uuid: "e-standup", event_title: "Standup", event_start_time: at(21, 9), event_end_time: at(21, 9, 30) },
  ]
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": () => ({ msg: "ok", data: events }),
    "/event/updateEvent": (url: URL, request: Request) => {
      const body = request.postDataJSON()
      sent.push(body)
      const e = events.find((x) => url.pathname.endsWith(`/${x.event_uuid}`))
      if (e) Object.assign(e, { event_start_time: body.startTime, event_end_time: body.endTime })
      return { msg: "ok", data: { event_uuid: e?.event_uuid } }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  })
  await page.goto(`/app/calendar?date=2026-10-19&view=${view}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  // A dev server compiles the app on its first visit: the week, however long that takes.
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  const block = page.locator('[data-hue-block][data-event-uuid="e-review"]')
  await expect(block).toBeVisible({ timeout: 30_000 })
  // The reveal is over, so nothing is still moving in.
  await page.waitForTimeout(800)
  return { sent, block }
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!

for (const theme of ["light", "dark"] as const) {
  test.describe(`a block dragged on the week at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("is carried to another day as the block pressed, its place kept, and lands there", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo)
      const b = (await block.boundingBox())!
      const monday = await box(page, '[data-day-col="0"]')
      const wednesday = await box(page, '[data-day-col="2"]')
      const x = b.x + b.width / 2
      const y = b.y + 12
      await page.mouse.move(x, y)
      await page.mouse.down()
      // Two days on and an hour later: Wednesday at 11:00.
      await page.mouse.move(wednesday.x + wednesday.width / 2, y + 56, { steps: 14 })

      await expect(block).toHaveClass(/calendar-lift/)
      // It says when it would land (the shared range, noon's rule included), with no tag beside it.
      // (Intl puts a narrow space before AM and PM: \s takes any.)
      await expect(block).toContainText(/11\s?AM\s*–\s*12\s?PM|11:00\s*–\s*12:00/)
      await expect(block).not.toContainText(/10:00\s*–\s*11:00/)
      // Drawn over Wednesday, centred in its column (moved by whole columns, each with its rule).
      const carried = (await block.boundingBox())!
      expect(Math.abs(carried.x + carried.width / 2 - (wednesday.x + wednesday.width / 2))).toBeLessThanOrEqual(2)
      // Its place on Monday is kept by the dashed placeholder.
      const origin = await box(page, "[data-drag-origin]")
      expect(origin.x).toBeGreaterThanOrEqual(monday.x)
      expect(origin.x + origin.width).toBeLessThanOrEqual(monday.x + monday.width + 1)
      // Painted over Tuesday's and Wednesday's own blocks and lines.
      const top = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest("[data-event-uuid]")?.getAttribute("data-event-uuid"), [carried.x + carried.width / 2, carried.y + 6])
      expect(top).toBe("e-review")
      await shot(page, "b1-carry", theme)

      await page.mouse.up()
      await expect.poll(() => sent.at(-1)).toMatchObject({ startTime: at(21, 11), endTime: at(21, 12) })
      await expect(page.locator("[data-drag-origin]")).toHaveCount(0)
      await expect(block).not.toHaveClass(/calendar-lift/)
      // Landed: drawn in Wednesday's column.
      const landed = (await block.boundingBox())!
      expect(landed.x).toBeGreaterThanOrEqual(wednesday.x)
      expect(landed.x + landed.width).toBeLessThanOrEqual(wednesday.x + wednesday.width + 1)
    })

    test("is stretched where it is from its bottom edge, with the resize cursor and no lift", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo)
      const b = (await block.boundingBox())!
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      const grip = block.locator('[data-resize-grip="bottom"]')
      await expect(grip).toBeVisible()
      const g = (await grip.boundingBox())!
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
      await page.mouse.down()
      // Half an hour longer: 28 px.
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 28, { steps: 6 })

      await expect(block).toHaveClass(/cursor-ns-resize/)
      await expect(block).not.toHaveClass(/calendar-lift/)
      // Its range as it stretches, and its length beside it.
      await expect(block).toContainText(/10:00\s*–\s*11:30/)
      await expect(block).toContainText("1 h 30")
      const stretched = (await block.boundingBox())!
      expect(Math.abs(stretched.x - b.x)).toBeLessThanOrEqual(2)
      expect(stretched.height - b.height).toBeGreaterThanOrEqual(26)
      await shot(page, "b1-stretch", theme)

      await page.mouse.up()
      await expect.poll(() => sent.at(-1)).toMatchObject({ startTime: at(19, 10), endTime: at(19, 11, 30) })
    })
  })

  // V-38: on a phone, a tap on your own event opens its sheet, and the sheet
  // stays. A finger's release is followed by a click on whatever is under it
  // by then: the sheet had drawn there, and that click closed it again in
  // ~0.4 s. Someone else's event, which doesn't move, opened on the click.
  test.describe(`your own block on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    for (const view of ["day", "week"] as const) {
      test(`opens its sheet with a tap in the ${view} view, and the sheet stays open`, async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        const { block } = await open(page, testInfo, view)
        await block.tap()
        const sheet = page.locator("[data-event-sheet]")
        await expect(sheet).toBeVisible({ timeout: 10_000 })
        // Sampled over 2 s: open the whole time.
        for (let t = 200; t <= 2000; t += 200) {
          await page.waitForTimeout(200)
          expect(await sheet.count(), `the sheet ${t} ms after the tap`).toBe(1)
        }
        await expect(sheet.getByText("Design review")).toBeVisible()
        // As tall as what it shows (V-44): the half sheet left ~40% of itself blank above Open details.
        const blank = await sheet.evaluate((el) => {
          const foot = el.querySelector("[data-card-footer]")
          const above = foot?.previousElementSibling
          return foot && above ? foot.getBoundingClientRect().top - above.getBoundingClientRect().bottom : -1
        })
        expect(blank, "the space between the event and its footer").toBeGreaterThanOrEqual(0)
        expect(blank, "the space between the event and its footer").toBeLessThan(24)
        await shot(page, `own-tap-${view}`, theme)
      })
    }

    // The same release, on an empty hour: the new event's sheet it opens stays.
    test("opens the new event's sheet with a tap on an empty hour, and the sheet stays open", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { block } = await open(page, testInfo, "day")
      const b = (await block.boundingBox())!
      // Two hours under the review's start: an hour nothing is in.
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 3)
      const sheet = page.locator("[data-event-dialog]")
      await expect(sheet).toBeVisible({ timeout: 10_000 })
      for (let t = 200; t <= 2000; t += 200) {
        await page.waitForTimeout(200)
        expect(await sheet.count(), `the new event's sheet ${t} ms after the tap`).toBe(1)
      }
    })

    // V-50, a late click. A finger's release opens the new event's sheet a frame later, and the tap's click
    // follows. On a loaded phone the click can come only once the sheet has appeared, while it is still rising
    // and its scrim is under the finger, and close it: the gate's run under load did (wU28, the leg above). This
    // leg holds the browser's own click back and sends the tap's one click, at the same point, the moment the
    // sheet appears. It models a late click; it doesn't prove a phone delivers one. (Sent 150 ms after the
    // release, the click met the risen sheet, not its scrim, on beta: v50red2.)
    test("keeps the new event's sheet open when the tap's click comes as the sheet appears", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { block } = await open(page, testInfo, "day")
      const b = (await block.boundingBox())!
      // Half an hour above the review: an hour nothing is in.
      const x = b.x + b.width / 2
      const y = b.y - b.height / 2
      await page.evaluate(
        ({ x, y }) => {
          const hold = (e: MouseEvent) => {
            if (!e.isTrusted) return
            window.removeEventListener("click", hold, true)
            e.stopImmediatePropagation()
            e.preventDefault()
          }
          window.addEventListener("click", hold, true)
          const seen = new MutationObserver(() => {
            if (!document.querySelector("[data-event-dialog]")) return
            seen.disconnect()
            const at = document.elementFromPoint(x, y)
            ;(window as unknown as { lateClickOn?: string }).lateClickOn = at?.closest("[data-event-dialog]")
              ? "the sheet"
              : at?.closest("[data-vaul-overlay]")
                ? "the scrim"
                : (at?.tagName ?? "nothing")
            at?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window }))
          })
          seen.observe(document.body, { childList: true, subtree: true })
        },
        { x, y },
      )
      await page.touchscreen.tap(x, y)
      const under = await page.waitForFunction(() => (window as unknown as { lateClickOn?: string }).lateClickOn, null, { timeout: 10_000 })
      const on = await under.jsonValue()
      console.log(`V50 the late click landed on ${on}`)
      expect(on, "the late click meets the rising sheet's scrim: anywhere else, this leg tests nothing").toBe("the scrim")
      const sheet = page.locator("[data-event-dialog]")
      for (let t = 200; t <= 2000; t += 200) {
        await page.waitForTimeout(200)
        expect(await sheet.count(), `the new event's sheet ${t} ms after the late click (it landed on ${on})`).toBe(1)
      }
    })

    test("is carried by a held finger, its move is sent, and no sheet opens", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "day")
      const b = (await block.boundingBox())!
      const x = b.x + b.width / 2
      const y = b.y + b.height / 2
      // A finger held past the lift (PRESS_LIFT.hold, 250 ms), then moved: a drag.
      const touch = await page.context().newCDPSession(page)
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
      await page.waitForTimeout(450)
      for (let i = 1; i <= 10; i++) {
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 9 }] })
        await page.waitForTimeout(16)
      }
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1)
      expect(sent[0].startTime, "the event moved later the same day").not.toBe(at(19, 10))
      await page.waitForTimeout(800)
      await expect(page.locator("[data-event-sheet]")).toHaveCount(0)
    })

    // Held still past the lift and let go, the block opens its menu (D16), a
    // sheet on a phone: the finger's release must leave it open, with nothing
    // in it chosen. Twice: the menu's chunk loads on the first opening.
    test("is held still for its menu, and the menu stays open", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { block } = await open(page, testInfo, "day")
      const b = (await block.boundingBox())!
      const touch = await page.context().newCDPSession(page)
      const hold = async () => {
        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] })
        await page.waitForTimeout(400)
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      }
      const menu = page.locator("[data-event-menu]")
      await hold()
      await expect(menu).toBeVisible({ timeout: 10_000 })
      await page.keyboard.press("Escape")
      await expect(menu).toHaveCount(0)
      await page.waitForTimeout(800)
      await hold()
      await expect(menu).toBeVisible({ timeout: 10_000 })
      for (let t = 200; t <= 2000; t += 200) {
        await page.waitForTimeout(200)
        expect(await menu.count(), `the menu ${t} ms after the finger lifted`).toBe(1)
      }
      await expect(page.locator("[data-event-sheet]")).toHaveCount(0)
      await shot(page, "own-hold-menu-day", theme)
    })
  })
}
