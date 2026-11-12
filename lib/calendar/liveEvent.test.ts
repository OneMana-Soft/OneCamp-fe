import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

const mutated = vi.hoisted(() => ({ keys: [] as string[][] }))
const CACHE = [
  "/event/getEvents?startDate=2026-11-01T00:00:00.000Z&endDate=2026-12-01T00:00:00.000Z",
  "/event/getEvents?startDate=2026-12-01T00:00:00.000Z&endDate=2027-01-01T00:00:00.000Z",
  "/calendar/calendars/events?ids=c1&from=2026-11-01T00:00:00.000Z&to=2026-12-01T00:00:00.000Z",
  "/event/getEvent/e9",
  "/calendar/calendars",
]
vi.mock("@/lib/swrMutate", () => ({
  appMutate: (match: (key: string) => boolean) => void mutated.keys.push(CACHE.filter(match)),
  cachedData: () => undefined,
}))

const { CALENDAR_LIVE_EVENT, calendarLiveOf, showsLive, useCalendarLive } = await import("./liveEvent")

const tell = (detail: unknown) => window.dispatchEvent(new CustomEvent(CALENDAR_LIVE_EVENT, { detail }))

afterEach(() => {
  mutated.keys = []
  vi.useRealTimers()
})

// Calendar head A (gcal-5): an event changed elsewhere, told live with its id
// and window alone; an open calendar reads again what it touches.
describe("a calendar told live", () => {
  pinTestClock()
  it("reads a message's id and window, and nothing that isn't one", () => {
    expect(calendarLiveOf({ event_id: "e1", from: "2026-11-05T09:00:00Z", to: "2026-11-05T10:00:00Z" })).toEqual({
      event_id: "e1", from: Date.parse("2026-11-05T09:00:00Z"), to: Date.parse("2026-11-05T10:00:00Z"),
    })
    for (const junk of [null, {}, { event_id: "" }, { event_id: 7 }]) expect(calendarLiveOf(junk)).toBeNull()
    // No window: every range of it reads again.
    expect(calendarLiveOf({ event_id: "e1" })).toMatchObject({ from: -Infinity, to: Infinity })
  })

  it("reads again once for a burst, while the calendar is open", () => {
    vi.useRealTimers() // pinTestClock mocks the date, and vitest refuses fake timers over a mocked date
    vi.useFakeTimers({ now: TEST_TODAY })
    const { unmount } = renderHook(() => useCalendarLive(300))
    tell({ event_id: "e1", from: "2026-11-05T09:00:00Z", to: "2026-11-05T10:00:00Z" })
    tell({ event_id: "e2", from: "2026-12-05T09:00:00Z", to: "2026-12-05T10:00:00Z" })
    tell({ nope: true })
    expect(mutated.keys).toEqual([])
    vi.advanceTimersByTime(300)
    expect(mutated.keys).toEqual([[CACHE[0], CACHE[1], CACHE[2]]])
    unmount()
    tell({ event_id: "e1", from: "2026-11-05T09:00:00Z", to: "2026-11-05T10:00:00Z" })
    vi.advanceTimersByTime(300)
    expect(mutated.keys).toHaveLength(1)
  })

  it("is raised by the app's message handler, which keeps no calendar code", () => {
    const handler = readFileSync("hooks/useMqttMessageHandler.ts", "utf8")
    const at = handler.indexOf("case MqttMessageType.Calendar_Live")
    expect(at, "the handler has no case for Calendar_Live").toBeGreaterThan(-1)
    expect(handler.slice(at, handler.indexOf("break", at))).toContain(`new CustomEvent("${CALENDAR_LIVE_EVENT}"`)
    expect(handler).not.toMatch(/from "@\/lib\/calendar\/liveEvent"/)
  })
})

// Head A (gcal-5): a live message's window narrows the lists showsEvent names (CR-B6 M1 + M4).
describe("showsLive over a change's window", () => {
  pinTestClock()
  const CACHE = [
    "/event/getEvents?startDate=2026-11-01T00:00:00.000Z&endDate=2026-12-01T00:00:00.000Z",
    "/event/getEvents?startDate=2026-12-01T00:00:00.000Z&endDate=2027-01-01T00:00:00.000Z",
    "/calendar/calendars/events?ids=c1&from=2026-11-01T00:00:00.000Z&to=2026-12-01T00:00:00.000Z",
    "/event/getEvent/e9",
    "/calendar/calendars",
  ]
  const at = (iso: string) => Date.parse(iso)

  it("touches the lists over a range the window meets, and the event itself", () => {
    const edge = { from: at("2026-11-30T23:00:00Z"), to: at("2026-12-01T01:00:00Z") }
    expect(CACHE.filter((k) => showsLive(k, { event_id: "e9", ...edge }))).toEqual(CACHE.slice(0, 4))
    const early = { from: at("2026-11-05T09:00:00Z"), to: at("2026-11-05T10:00:00Z") }
    expect(CACHE.filter((k) => showsLive(k, { event_id: "e1", ...early }))).toEqual([CACHE[0], CACHE[2]])
    expect(showsLive(undefined, { event_id: "e1", ...early })).toBe(false)
    // Open ends meet every range.
    expect(CACHE.filter((k) => showsLive(k, { event_id: "e1", from: -Infinity, to: Infinity }))).toEqual(CACHE.slice(0, 3))
  })

  it("touches a list whose cached answer holds the event, so a moved event leaves its old place", () => {
    // A series moved from 5 Nov to 10 Dec: the message carries its new window, November's lists still show it there.
    const U = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"
    const moved = { from: at("2026-12-10T09:00:00Z"), to: at("2026-12-10T10:00:00Z") }
    const cached = (key: string) => (key === CACHE[0] ? { data: [{ event_uuid: U }] } : key === CACHE[2] ? { data: [{ id: `${U}_20261105T090000Z` }] } : undefined)
    expect(CACHE.filter((k) => showsLive(k, { event_id: U, ...moved }, cached))).toEqual([CACHE[0], CACHE[1], CACHE[2]])
    // Without the cache's answers only the new place reads again.
    expect(CACHE.filter((k) => showsLive(k, { event_id: U, ...moved }))).toEqual([CACHE[1]])
  })
})
