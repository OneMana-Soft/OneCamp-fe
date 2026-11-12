import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"

// The trash's wiring (calendar head B): Restore sends the calendar's own restore, puts the event back on an open
// grid at once (the live re-read head A's grid already takes), and its toast's Show jumps to its day; a refusal
// is said in the server's words, on the row.
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast }))

import { restoreFromTrash } from "@/components/calendar/calendarTrash"
import { CALENDAR_LIVE_EVENT, calendarLiveOf } from "@/lib/calendar/liveEvent"
import type { TrashedEvent } from "@/lib/calendar/trash"

afterEach(() => toast.mockReset())

const EVENT: TrashedEvent = { id: "ev-1", title: "Launch review", start: { at: "2026-10-16T14:00:00Z" }, end: { at: "2026-10-16T15:00:00Z" }, all_day: false, deleted_at: "2026-10-15T10:00:00Z" }

describe("restoring from the trash", () => {
  pinTestClock()

  it("restores, tells the open grid at once, and its toast's Show jumps to the event's day", async () => {
    const send = vi.fn().mockResolvedValue({})
    const show = vi.fn()
    const heard: unknown[] = []
    const listen = (e: Event) => heard.push((e as CustomEvent).detail)
    window.addEventListener(CALENDAR_LIVE_EVENT, listen)
    expect(await restoreFromTrash({ send, show }, EVENT)).toBeNull()
    window.removeEventListener(CALENDAR_LIVE_EVENT, listen)
    expect(send).toHaveBeenCalledWith({ method: "POST", apiEndpoint: "/calendar/events", appendToUrl: "/ev-1/restore", quiet: true })
    expect(heard).toEqual([{ event_id: "ev-1", from: "2026-10-16T14:00:00.000Z", to: "2026-10-16T15:00:00.000Z" }])
    const said = toast.mock.calls[0][0]
    expect(said.title).toBe("Restored “Launch review”")
    said.action.props.onClick()
    expect(show).toHaveBeenCalledWith(new Date("2026-10-16T14:00:00Z"))
  })

  // CR-B21 row 2684, F1(b): a window that is no day (an all-day row dated 2026-02-30) skips only its window and Show.
  it("restores a row whose date is no day: it still toasts and every open list reads again, with no window and no Show", async () => {
    const send = vi.fn().mockResolvedValue({})
    const show = vi.fn()
    const heard: unknown[] = []
    const listen = (e: Event) => heard.push((e as CustomEvent).detail)
    const leap: TrashedEvent = { ...EVENT, id: "ev-2", title: "Leap day", all_day: true, start: { date: "2026-02-30" }, end: { date: "2026-03-01" } }
    window.addEventListener(CALENDAR_LIVE_EVENT, listen)
    try {
      expect(await restoreFromTrash({ send, show }, leap)).toBeNull()
    } finally {
      window.removeEventListener(CALENDAR_LIVE_EVENT, listen)
    }
    expect(heard).toEqual([{ event_id: "ev-2" }])
    expect(calendarLiveOf(heard[0])).toEqual({ event_id: "ev-2", from: -Infinity, to: Infinity })
    const said = toast.mock.calls[0][0]
    expect(said.title).toBe("Restored “Leap day”")
    expect(said.action).toBeUndefined()
    expect(show).not.toHaveBeenCalled()
  })

  it("says a refusal in the server's words, and tells nobody", async () => {
    const send = vi.fn().mockRejectedValue({ response: { status: 403, data: { msg: "Only its organiser can restore it." } } })
    expect(await restoreFromTrash({ send, show: vi.fn() }, EVENT)).toBe("Only its organiser can restore it.")
    expect(toast).not.toHaveBeenCalled()
  })
})
