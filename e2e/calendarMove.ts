import { expect, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { CALENDAR_READS, SAM, stubBackend } from "./stubbedApp"

// A meeting with a guest, on a stubbed calendar, for a move to ask "Tell
// guests?" of (e2e/calendarMoveTellsGuests, and e2e/overlayTapFocus's third path).

const NOW = new Date(2026, 9, 19, 8, 0)
export const at = (day: number, hour: number, min = 0) => new Date(2026, 9, day, hour, min).toISOString()
export const REVIEW = "0c1d2e3f-0000-4000-8000-00000000a001"

/** Opens the calendar on Monday 19 Oct with the meeting on it, its server stubbed; returns what was sent and its block. */
export async function openMeeting(page: Page, testInfo: TestInfo, view: "week" | "day") {
  const sent: Record<string, unknown>[] = []
  // The server's copy: a saved move is what the calendar reads again after it.
  const review = {
    event_uuid: REVIEW,
    event_title: "Design review",
    event_start_time: at(19, 10),
    event_end_time: at(19, 11),
    event_created_by: SAM,
    event_participants: [],
    event_guests: [{ email: "alex@example.com", name: "Alex Kim", role: "required", response: "needs_action" }],
  }
  let sequence = 2
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    ...CALENDAR_READS,
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/getEvents": () => ({ msg: "ok", data: [review] }),
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    [`/calendar/events/${REVIEW}`]: (_url: URL, request: Request) => {
      if (request.method() === "PATCH") {
        const body = request.postDataJSON() as { start: { at: string }; end: { at: string } }
        sent.push(body as unknown as Record<string, unknown>)
        Object.assign(review, { event_start_time: body.start.at, event_end_time: body.end.at })
        sequence++
      }
      return {
        msg: "ok",
        data: { id: REVIEW, kind: "event", title: "Design review", notes: "", location: "", sequence, all_day: false, start: { at: review.event_start_time }, end: { at: review.event_end_time }, attendees: [], organiser: { user_uuid: SAM.user_uuid } },
      }
    },
  })
  await page.goto(`/app/calendar?date=2026-10-19&view=${view}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  const block = page.locator(`[data-hue-block][data-event-uuid="${REVIEW}"]`)
  await expect(block).toBeVisible({ timeout: 30_000 })
  // The reveal is over, so nothing is still moving in.
  await page.waitForTimeout(800)
  return { sent, block }
}

/** The question a move of a meeting with guests asks. */
export const askOf = (page: Page) => page.getByRole("dialog", { name: "Send an update to your guests?" })

/** A phone's drag (PRESS_LIFT): a finger held on the block, then moved down 90px and lifted. */
export async function holdAndDrag(page: Page, block: Locator) {
  const b = (await block.boundingBox())!
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  const touch = await page.context().newCDPSession(page)
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await page.waitForTimeout(450)
  for (let i = 1; i <= 10; i++) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 9 }] })
    await page.waitForTimeout(16)
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
