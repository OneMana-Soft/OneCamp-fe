import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

// Today's read, stood in for: what was asked, how, and the answer.
const asked: { url: string; config: unknown; request: unknown }[] = []
let answer: { data?: unknown; isError?: unknown } = {}
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string, _schema: unknown, config: unknown, request: unknown) => {
    asked.push({ url, config, request })
    return { data: answer.data, isError: answer.isError, isLoading: !answer.data && !answer.isError, mutate }
  },
}))

const { useCalendarRange } = await import("@/hooks/useCalendarRange")
const { monthGridRange } = await import("@/components/calendar/calendarLayout")
const { OWN_ERRORS } = await import("@/lib/axiosInstance")

afterEach(() => {
  cleanup()
  asked.length = 0
  answer = {}
  mutate.mockClear()
})

// Day 0 is the calendar's read today: the month grid's events, on the same
// key and with the same options, so the two share one request.
describe("useCalendarRange, on day 0", () => {
  it("asks for a month grid as the calendar does", () => {
    const grid = monthGridRange(new Date(2026, 9, 14))
    renderHook(() => useCalendarRange(grid))
    expect(asked.at(-1)).toEqual({
      url: `/event/getEvents?startDate=${grid.start.toISOString()}&endDate=${grid.end.toISOString()}`,
      config: { keepPreviousData: true },
      request: OWN_ERRORS,
    })
  })

  it("answers the events, or says it's still loading or that it failed", () => {
    const grid = monthGridRange(new Date(2026, 9, 14))
    const loading = renderHook(() => useCalendarRange(grid))
    expect(loading.result.current.status).toBe("loading")
    expect(loading.result.current.events).toEqual([])

    answer = { isError: new Error("503") }
    const failed = renderHook(() => useCalendarRange(grid))
    expect(failed.result.current.status).toBe("error")
    failed.result.current.retry()
    expect(mutate).toHaveBeenCalledTimes(1)

    const standup = { event_uuid: "e-1", event_title: "Stand-up", event_start_time: "2026-10-14T04:30:00Z", event_end_time: "2026-10-14T04:45:00Z" }
    answer = { data: { data: [standup] } }
    const ready = renderHook(() => useCalendarRange(grid))
    expect(ready.result.current.status).toBe("ready")
    expect(ready.result.current.events).toEqual([standup])
  })
})
