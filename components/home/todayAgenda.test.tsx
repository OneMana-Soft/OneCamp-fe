import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

import { classifyEvent, joinState, planAgenda, callLinkOf } from "@/components/home/homeTime"
import { OWN_HUE } from "@/components/calendar/calendarTones"

/** Today (hub.md H12, H13). */
const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m)
// The agenda's morning, 10:48, for every test in the file; one moves it to 9:00.
pinTestClock(at(10, 48))
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
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ ...answer, mutate: () => Promise.resolve(undefined) }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam" } } }),
}))
const makeRequest = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))
const { TodayAgenda, TodayStrip } = await import("@/components/home/TodayAgenda")

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("the agenda card", () => {
  it("grounds the current event on brand-muted", () => {
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
    vi.setSystemTime(at(9, 0))
    answer = { isLoading: false, data: { data: [ev("Launch sync", 10, 30, 11, 30)] } }
    const { container } = render(<TodayStrip />)
    const scroller = container.querySelector("[data-today-scroller]")!
    expect(scroller.className).toMatch(/\bsnap-mandatory\b/)
    expect(scroller.className).toMatch(/\bscroll-px-4\b/)
    expect(scroller.className).toMatch(/\bpx-4\b/)
  })

  // STEP5_PLAN §3 C: an event is in its own colour on Home, as in the calendar.
  it("draws each event in its own colour, the rest in its calendar's", () => {
    vi.setSystemTime(at(9, 0))
    answer = { isLoading: false, data: { data: [ev("Launch sync", 10, 30, 11, 30, { event_hue: "berry" }), ev("Acme weekly", 17, 30, 18, 0)] } }
    const { container } = render(<TodayAgenda />)
    const bars = [...container.querySelectorAll<HTMLElement>("[data-agenda-bar]")].map((b) => b.style.background)
    // Acme weekly has no colour of its own: it is in its calendar's, your own.
    expect(bars).toEqual(["var(--camp-berry)", `var(--camp-${OWN_HUE})`])
  })

  it("draws focus time as the calendar does, in ink-3, never an area's hue", () => {
    vi.setSystemTime(at(9, 0))
    answer = { isLoading: false, data: { data: [ev("Deep work", 10, 0, 12, 0, { event_is_focus: true })] } }
    const { container } = render(<TodayAgenda />)
    expect(container.querySelector<HTMLElement>("[data-agenda-bar]")!.style.background).toBe("var(--ink-3)")
  })

  // Calendar B3a: an invitation is answered where it shows, with the card's control.
  describe("an invitation", () => {
    const organiser = { user_uuid: "maya", user_name: "Maya Chen" }
    const invited = (response: string) =>
      ev("Design crit", 14, 0, 15, 0, { event_created_by: organiser, event_participants: [organiser, { user_uuid: "sam", user_name: "Sam" }], event_guests: [{ user_uuid: "sam", role: "required", response }] })

    it("asks Going? while unanswered, sends the answer, and keeps it in view", async () => {
      vi.setSystemTime(at(9, 0))
      answer = { isLoading: false, data: { data: [invited("needs_action")] } }
      render(<TodayAgenda />)
      const going = screen.getByRole("radiogroup", { name: "Going?" })
      fireEvent.click(within(going).getByRole("radio", { name: "Yes" }))
      await waitFor(() => expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ appendToUrl: "/Design%20crit/answer", payload: expect.objectContaining({ answer: "accepted" }) })))
      expect(screen.getByRole("radiogroup", { name: "Going?" })).toBeTruthy()
      makeRequest.mockClear()
    })

    it("doesn't ask once answered elsewhere, or on what you organise", () => {
      vi.setSystemTime(at(9, 0))
      answer = { isLoading: false, data: { data: [invited("accepted"), ev("Mine", 16, 0, 17, 0, { event_created_by: { user_uuid: "sam" }, event_guests: [] })] } }
      render(<TodayAgenda />)
      expect(screen.queryByRole("radiogroup", { name: "Going?" })).toBeNull()
    })

    it("asks on the phone's strip too, at 44 px", () => {
      vi.setSystemTime(at(9, 0))
      answer = { isLoading: false, data: { data: [invited("needs_action")] } }
      render(<TodayStrip />)
      expect(within(screen.getByRole("radiogroup", { name: "Going?" })).getByRole("radio", { name: "Yes" }).className).toMatch(/\bh-11\b/)
    })
  })

  it("hides itself when the calendar is not there at all", () => {
    answer = { isLoading: false, isError: { response: { status: 404 } } }
    const { container } = render(<TodayAgenda />)
    expect(container.innerHTML).toBe("")
  })

  // A pasted link can carry the meeting's password (?pwd=), and Home is on screens people share (CR-27).
  it("says a link in an event's title as its host, in a row, an all-day chip and the phone's strip", () => {
    answer = {
      isLoading: false,
      data: { data: [ev("Standup https://zoom.us/j/1?pwd=x", 10, 30, 11, 30), ev("https://meet.example.com/j/2?pwd=y", 0, 0, 0, 0, { event_all_day: true, event_start_date: "2026-10-11", event_end_date: "2026-10-12" })] },
    }
    const { container } = render(
      <>
        <TodayAgenda />
        <TodayStrip />
      </>,
    )
    expect(screen.getAllByText("Standup zoom.us")).toHaveLength(2)
    expect(screen.getAllByText("meet.example.com")).toHaveLength(2)
    expect(container.textContent).not.toContain("pwd")
  })

  // The events API leaves an untitled event's title out (omitempty), whatever the type says (CR-29).
  it("draws an event with no title in a row, an all-day chip and the phone's strip", () => {
    const untitled = (e: ReturnType<typeof ev>) => ({ ...e, event_title: undefined })
    answer = {
      isLoading: false,
      data: { data: [untitled(ev("u1", 10, 30, 11, 30)), untitled(ev("u2", 0, 0, 0, 0, { event_all_day: true, event_start_date: "2026-10-11", event_end_date: "2026-10-12" }))] },
    }
    const { container } = render(
      <>
        <TodayAgenda />
        <TodayStrip />
      </>,
    )
    const rows = [...container.querySelectorAll("[data-agenda-row]")]
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.textContent).toContain("Untitled event")
    expect(container.querySelector(".chip")?.textContent).toBe("Untitled event")
  })
})
