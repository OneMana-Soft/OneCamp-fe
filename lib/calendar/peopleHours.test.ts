import { createElement, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { inHours, theirTime, usePeopleHours } from "./peopleHours"
import { pinTestClock } from "@/lib/testing/testClock"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { CalendarPost } from "@/services/endpoints/calendar"

const post = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))

// The dates below are their own instants; the clock is pinned all the same.
pinTestClock()

const jonas = { tz: "Europe/London", week: { "1": [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "17:00" }] } }

// Calendar A3: a time in someone's hours, in their zone.
describe("someone's working hours", () => {
  it("holds a time inside one of their ranges, that day, in their zone", () => {
    // Monday 19 Oct 2026: London is GMT+1.
    expect(inHours(jonas, new Date("2026-10-19T09:00:00Z"), new Date("2026-10-19T09:30:00Z"))).toBe(true) // 10:00 London
  })

  it("isn't across their lunch, before they start, or on a day off", () => {
    expect(inHours(jonas, new Date("2026-10-19T11:15:00Z"), new Date("2026-10-19T11:45:00Z"))).toBe(false) // 12:15–12:45
    expect(inHours(jonas, new Date("2026-10-19T07:30:00Z"), new Date("2026-10-19T08:00:00Z"))).toBe(false) // 08:30
    expect(inHours(jonas, new Date("2026-10-20T09:00:00Z"), new Date("2026-10-20T09:30:00Z"))).toBe(false) // Tuesday
  })

  it("ends exactly at a range's end", () => {
    expect(inHours(jonas, new Date("2026-10-19T15:30:00Z"), new Date("2026-10-19T16:00:00Z"))).toBe(true) // 16:30–17:00
  })

  it("says the time it is for them", () => {
    expect(theirTime(new Date("2026-10-19T20:00:00Z"), "Europe/London")).toMatch(/^(21:00|9:00\sPM)$/)
  })
})

// Head 5d: one read answers both their hours and, for a day, where each of them works.
describe("what people's days say", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

  it("asks once for their hours and where each works that day, each person once", async () => {
    post.mockResolvedValue({ data: { data: { jonas }, private: [], where: { maya: "Home", jonas: "Lisbon office" } } })
    const { result } = renderHook(() => usePeopleHours(["maya", "jonas", "maya", ""], "2026-10-19"), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ hours: { jonas }, where: { maya: "Home", jonas: "Lisbon office" } }))
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(CalendarPost.PeopleHours, { people: ["jonas", "maya"], day: "2026-10-19" }, OWN_ERRORS)
  })
})
