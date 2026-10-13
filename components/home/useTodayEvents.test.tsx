import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

// Home's today (CAL-BUG-2): a Google all-day event comes with its dates beside
// instants at midnight UTC. Home places it by its dates, as an
// all-day item, and "Next" is the next meeting, never the all-day one.
const answer = {
  data: [
    {
      event_uuid: "gcal-offsite",
      event_title: "Offsite",
      event_start_time: "2026-10-14T00:00:00Z",
      event_end_time: "2026-10-15T00:00:00Z",
      event_all_day: true,
      event_start_date: "2026-10-14",
      event_end_date: "2026-10-15",
    },
    { event_uuid: "e1", event_title: "Design review", event_start_time: "", event_end_time: "" },
  ],
}
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: answer, isLoading: false, isError: undefined, mutate: vi.fn() }) }))

import { useTodayEvents } from "./useTodayEvents"

const original = process.env.TZ
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

describe("Home's today", () => {
  for (const zone of ["America/New_York", "Asia/Kolkata", "Pacific/Auckland"]) {
    it(`has a Google all-day event on its date, all day, and the meeting as Next, in ${zone}`, () => {
      process.env.TZ = zone
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(2026, 9, 14, 10))
      answer.data[1].event_start_time = new Date(2026, 9, 14, 14).toISOString()
      answer.data[1].event_end_time = new Date(2026, 9, 14, 15).toISOString()
      const { result } = renderHook(() => useTodayEvents())
      const offsite = result.current.events.find((e) => e.event_uuid === "gcal-offsite")
      expect(offsite?.event_start_time).toBe(new Date(2026, 9, 14).toISOString())
      expect(offsite?.event_end_time).toBe(new Date(2026, 9, 15).toISOString())
      expect(result.current.next?.event_uuid).toBe("e1")
    })
  }

  it("leaves yesterday's Google all-day event off today (in Auckland its instants run to 13:00 today)", () => {
    process.env.TZ = "Pacific/Auckland"
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 15, 10))
    answer.data[1].event_start_time = new Date(2026, 9, 15, 14).toISOString()
    answer.data[1].event_end_time = new Date(2026, 9, 15, 15).toISOString()
    const { result } = renderHook(() => useTodayEvents())
    expect(result.current.events.map((e) => e.event_uuid)).toEqual(["e1"])
  })
})
