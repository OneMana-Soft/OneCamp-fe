import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { projectHue } from "@/lib/projectHue"
import { hueFor } from "@/lib/campHue"
import type { CalendarEventInterface } from "@/types/calendar"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, mutate: vi.fn() }) }))

type Module = typeof import("./otherCalendars")
let m: Module

// Each test starts from a fresh page: storage cleared, and the module (which
// reads storage once a page) loaded again.
beforeEach(async () => {
  window.localStorage.clear()
  vi.resetModules()
  m = await import("./otherCalendars")
})
afterEach(cleanup)

const project = { id: "c1", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "view" as const }
const family = { id: "c2", name: "Family", kind: "external", access: "manage" as const, mine: true }
const personal = { id: "c0", name: "Personal", kind: "personal", access: "manage" as const, mine: true }

// Calendar A6: another calendar's event drawn as the grid draws events.
describe("another calendar's events on the grid", () => {
  it("keeps an event's times and calendar, and draws it in its calendar's colour, a project's its project's", () => {
    const e = m.asGridEvent({ id: "e1", calendar_id: "c1", title: "Release", start: { at: "2026-10-21T09:00:00Z" }, end: { at: "2026-10-21T10:00:00Z" }, all_day: false }, project)
    expect(e).toMatchObject({ event_uuid: "e1", event_calendar_id: "c1", event_title: "Release", event_start_time: "2026-10-21T09:00:00Z", event_end_time: "2026-10-21T10:00:00Z", calendar_hue: projectHue("p-1") })
    expect(e.event_hue).toBeUndefined()
  })

  it("keeps an event's own colour, all-day dates and kind", () => {
    const e = m.asGridEvent({ id: "e2", calendar_id: "c1", title: "Offsite", start: { date: "2026-11-05" }, end: { date: "2026-11-07" }, all_day: true, hue: "moss", kind: "out_of_office" }, project)
    expect(e).toMatchObject({ event_all_day: true, event_start_date: "2026-11-05", event_end_date: "2026-11-07", event_hue: "moss", event_is_away: true })
  })
})

describe("a calendar's colour", () => {
  it("is the one you chose here, else a project's, else its own, else one from its id that isn't sun", () => {
    expect(m.calendarHue(project, { c1: "sun" })).toBe("sun")
    expect(m.calendarHue(project, {})).toBe(projectHue("p-1"))
    expect(m.calendarHue({ id: "c2", hue: "dusk" }, {})).toBe("dusk")
    // "c2" falls on sun, your own calendar's: the one hash again, on its id with a mark.
    expect(hueFor("c2")).toBe("sun")
    expect(m.calendarHue({ id: "c2", hue: "" }, {})).toBe(hueFor("c2'"))
    expect(hueFor("c2'")).not.toBe("sun")
  })
})

// Your own events, shown and coloured as their calendars are.
describe("your own events by their calendars", () => {
  const ev = (id: string, calendar?: string, hue?: string): CalendarEventInterface => ({
    event_uuid: id, event_calendar_id: calendar, event_hue: hue, event_title: id, event_start_time: "2026-10-21T09:00:00Z", event_end_time: "2026-10-21T10:00:00Z",
  })
  const byId = new Map([personal, family, project].map((c) => [c.id, c]))
  const own = new Set(["mine-personal", "mine-family", "mine-legacy", "mine-launch", "gcal-1"])
  const list = [ev("mine-personal", "c0"), ev("mine-family", "c2"), ev("mine-legacy"), ev("mine-launch", "c1"), ev("theirs", "c1"), ev("gcal-1")]
  const ids = (l: CalendarEventInterface[]) => l.map((e) => e.event_uuid)

  it("keeps Personal's as Personal says, and an import's or a project's with its calendar, in its colour", () => {
    const shown = m.dressOwn(list, own, true, byId, { hidden: [], people: [], hues: { c2: "berry" } })
    expect(ids(shown)).toEqual(["mine-personal", "mine-family", "mine-legacy", "mine-launch", "theirs", "gcal-1"])
    expect(shown.find((e) => e.event_uuid === "mine-family")?.calendar_hue).toBe("berry")
    expect(shown.find((e) => e.event_uuid === "mine-launch")?.calendar_hue).toBe(projectHue("p-1"))
    expect(shown.find((e) => e.event_uuid === "mine-personal")?.calendar_hue).toBeUndefined()
  })

  it("hides Personal's when Personal is off, and an import's when its calendar is, and never others' or Google's", () => {
    const shown = m.dressOwn(list, own, false, byId, { hidden: ["c2"], people: [], hues: {} })
    expect(ids(shown)).toEqual(["mine-launch", "theirs", "gcal-1"])
  })
})

describe("the choices about calendars", () => {
  it("are one memory for the page: what one place changes, every other shows", () => {
    const a = renderHook(() => m.useCalendarChoices())
    const b = renderHook(() => m.useCalendarChoices())
    act(() => m.choose(() => ({ hidden: ["c1"], hues: { c1: "lake" } })))
    expect(a.result.current.hidden).toEqual(["c1"])
    expect(b.result.current.hues).toEqual({ c1: "lake" })
    expect(JSON.parse(window.localStorage.getItem("onecamp:calendars-hidden") || "[]")).toEqual(["c1"])
  })

  it("are read once a page from storage, leaving out what it can't read", async () => {
    window.localStorage.setItem("onecamp:calendars-hidden", JSON.stringify(["c1", 7]))
    window.localStorage.setItem("onecamp:calendar-people", JSON.stringify([{ id: "c9", name: "Jonas" }, { id: 3 }]))
    window.localStorage.setItem("onecamp:calendar-hues", JSON.stringify({ c1: "moss", c2: "chartreuse" }))
    vi.resetModules()
    m = await import("./otherCalendars")
    const { result } = renderHook(() => m.useCalendarChoices())
    // The views' choices are kept beside them (lib/calendar/choices.test).
    expect(result.current).toEqual({ hidden: ["c1"], people: [{ id: "c9", name: "Jonas" }], hues: { c1: "moss" }, view: expect.objectContaining({ span: "4d" }) })
  })

  // DESIGN-BUILD-3, 20 Oct 2026: a phone couldn't hide Personal or Assigned
  // tasks. Your own rows are choices like any calendar's, so the panel and a
  // phone's calendar options show and hide them alike, and Show only this
  // on any one hides every other, yours included.
  it("hold your own rows too, which Show only this hides with the rest", () => {
    const { result } = renderHook(() => m.useCalendarRows())
    act(() => result.current.toggle("tasks"))
    expect(result.current.hidden).toEqual(["tasks"])
    act(() => result.current.only("onecamp"))
    expect(result.current.hidden.sort()).toEqual(["google", "tasks"])
    act(() => result.current.only("c9"))
    expect(result.current.hidden.sort()).toEqual(["google", "onecamp", "tasks"])
    expect(JSON.parse(window.localStorage.getItem("onecamp:calendars-hidden") || "[]").sort()).toEqual(["google", "onecamp", "tasks"])
  })

  it("are kept for the visit when storage is blocked", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    const { result } = renderHook(() => m.useCalendarChoices())
    act(() => m.choose(() => ({ hidden: ["c3"] })))
    expect(result.current.hidden).toEqual(["c3"])
    set.mockRestore()
  })
})
