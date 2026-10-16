import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { classifyEvent, joinState, planAgenda, callLinkOf } from "@/components/home/homeTime"

/** Today (hub.md H12, H13). */
const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m)
const ev = (id: string, h1: number, m1: number, h2: number, m2: number, extra: object = {}) => ({
  event_uuid: id,
  event_title: id,
  event_start_time: at(h1, m1).toISOString(),
  event_end_time: at(h2, m2).toISOString(),
  ...extra,
})

describe("past, current and future", () => {
  it("is a pure classification against now", () => {
    expect(classifyEvent(ev("a", 9, 30, 9, 45), at(10, 48))).toBe("past")
    expect(classifyEvent(ev("b", 10, 30, 11, 0), at(10, 48))).toBe("current")
    expect(classifyEvent(ev("c", 14, 0, 16, 0), at(10, 48))).toBe("future")
  })

  it("puts the now-line between the last started event and the next, never through a current one", () => {
    const plan = planAgenda([ev("a", 9, 30, 9, 45), ev("c", 14, 0, 16, 0)], at(10, 48))
    expect(plan.nowLineAfter).toBe(0)
    expect(planAgenda([ev("b", 10, 30, 11, 0)], at(10, 48)).nowLineAfter).toBeNull()
  })

  it("folds more than two past events under 'N earlier', and shows five", () => {
    const evs = [ev("p1", 7, 0, 7, 30), ev("p2", 8, 0, 8, 30), ev("p3", 9, 0, 9, 30), ...[11, 12, 13, 14, 15, 16].map((h) => ev(`f${h}`, h, 0, h, 30))]
    const plan = planAgenda(evs, at(10, 0))
    expect(plan.earlier).toHaveLength(3)
    expect(plan.rows).toHaveLength(5)
    expect(plan.more).toBe(1)
  })
})

describe("joinState", () => {
  const e = (h: number, m: number) => ({ ...ev("x", h, m, h + 1, m), hasCall: true })
  it("is hidden without a call, or more than 10 minutes out, or after the end", () => {
    expect(joinState({ ...e(11, 0), hasCall: false }, at(10, 58))).toBe("hidden")
    expect(joinState(e(11, 0), at(10, 40))).toBe("hidden")
    expect(joinState(e(11, 0), at(12, 5))).toBe("hidden")
  })
  it("is secondary from 10 minutes before, primary from 2, live with people in", () => {
    expect(joinState(e(11, 0), at(10, 52))).toBe("secondary")
    expect(joinState(e(11, 0), at(10, 59))).toBe("primary")
    expect(joinState(e(11, 0), at(11, 20))).toBe("primary")
    expect(joinState({ ...e(11, 0), live: true }, at(10, 55))).toBe("live")
  })
  it("finds a call link in the description", () => {
    expect(callLinkOf("Join at https://meet.example.com/abc today")).toBe("https://meet.example.com/abc")
    expect(callLinkOf("Notes: https://docs.example.com/x")).toBeUndefined()
  })
})

/* The card. */
let answer: { data?: unknown; isLoading: boolean; isError?: unknown } = { isLoading: false }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...answer, mutate: () => {} }) }))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
const { TodayAgenda, TodayStrip } = await import("@/components/home/TodayAgenda")

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("the agenda card", () => {
  it("grounds the current event on brand-muted", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(at(10, 48))
    answer = { isLoading: false, data: { data: [ev("Launch sync", 10, 30, 11, 30), ev("Acme weekly", 17, 30, 18, 0)] } }
    const { container } = render(<TodayAgenda />)
    const current = container.querySelector('[data-agenda-row="current"]')!
    expect(current.className).toMatch(/brand-muted/)
    expect(current.querySelector('[data-agenda-bar="current"]')).not.toBeNull()
  })

  it("keeps its card when the day is empty", () => {
    answer = { isLoading: false, data: { data: [] } }
    const { container } = render(<TodayAgenda />)
    expect(container.querySelector("[data-agenda-card] [data-agenda-empty]")).not.toBeNull()
    expect(screen.getByText("Nothing on your calendar today")).toBeTruthy()
  })

  // QA SH-15 (14 Oct 2026): on a phone the strip's first card snapped to the
  // screen's edge, x = 0, out of the 16px gutter.
  it("snaps the phone's strip to the 16px gutter, not the screen's edge", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(at(9, 0))
    answer = { isLoading: false, data: { data: [ev("Launch sync", 10, 30, 11, 30)] } }
    const { container } = render(<TodayStrip />)
    const scroller = container.querySelector("[data-today-scroller]")!
    expect(scroller.className).toMatch(/\bsnap-mandatory\b/)
    expect(scroller.className).toMatch(/\bscroll-px-4\b/)
    expect(scroller.className).toMatch(/\bpx-4\b/)
  })

  it("hides itself when the calendar is not there at all", () => {
    answer = { isLoading: false, isError: { response: { status: 404 } } }
    const { container } = render(<TodayAgenda />)
    expect(container.innerHTML).toBe("")
  })
})
