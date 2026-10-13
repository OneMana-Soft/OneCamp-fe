import { describe, expect, it } from "vitest"
import { differenceInCalendarDays } from "date-fns"
import { agendaDays, agendaEmptyTitle, agendaTitles, agendaWindowFrom, nextAgendaWindow, previousAgendaWindow } from "./calendarAgenda"

const d = (s: string) => new Date(s + "T12:00:00")
const busy = new Set(["2026-09-03", "2026-09-24", "2026-09-30"])
const key = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
const items = (day: Date) => (busy.has(key(day)) ? ["x"] : [])

describe("agendaDays", () => {
  it("lists only the days with something on them, from today when today is in range", () => {
    const got = agendaDays(d("2026-09-01"), d("2026-09-30"), items, d("2026-09-10")).map((g) => g.day.getDate())
    expect(got).toEqual([24, 30])
  })
  it("starts at the range when today is outside it", () => {
    const got = agendaDays(d("2026-09-01"), d("2026-09-30"), items, d("2026-12-01")).map((g) => g.day.getDate())
    expect(got).toEqual([3, 24, 30])
  })
})

// CAL-BUG-19: the desktop agenda pages by what it listed.
describe("the desktop agenda's window", () => {
  const day = (w: { from: Date; to: Date }) => [w.from.getDate(), w.to.getDate(), w.to.getMonth() + 1]

  it("opens on the chosen day and runs to the month's end", () => {
    expect(day(agendaWindowFrom(new Date(2026, 9, 13, 15)))).toEqual([13, 31, 10])
  })

  it("lists the whole range when asked, today or not", () => {
    const got = agendaDays(d("2026-09-01"), d("2026-09-30"), items, d("2026-09-10"), false).map((g) => g.day.getDate())
    expect(got).toEqual([3, 24, 30])
  })

  it("never skips or repeats a day, a year forward and a year back", () => {
    let w = agendaWindowFrom(new Date(2026, 9, 13))
    for (let i = 0; i < 14; i++) {
      const next = nextAgendaWindow(w)
      expect(differenceInCalendarDays(next.from, w.to)).toBe(1)
      expect(next.to >= next.from).toBe(true)
      expect(next.from.getMonth()).toBe(next.to.getMonth())
      w = next
    }
    w = agendaWindowFrom(new Date(2026, 9, 13))
    for (let i = 0; i < 14; i++) {
      const prev = previousAgendaWindow(w)
      expect(differenceInCalendarDays(w.from, prev.to)).toBe(1)
      expect(prev.to >= prev.from).toBe(true)
      expect(prev.from.getMonth()).toBe(prev.to.getMonth())
      w = prev
    }
  })

  it("goes from 13 October to November, and back to 1 to 12 October", () => {
    const first = agendaWindowFrom(new Date(2026, 9, 13))
    expect(day(nextAgendaWindow(first))).toEqual([1, 30, 11])
    expect(day(previousAgendaWindow(first))).toEqual([1, 12, 10])
  })

  it("is titled by its days, or its month when it is the whole month", () => {
    const first = agendaWindowFrom(new Date(2026, 9, 13))
    expect(agendaTitles(first)).toEqual(["13 – 31 Oct 2026", "13 – 31 Oct", "13–31 Oct"])
    expect(agendaTitles(nextAgendaWindow(first))).toEqual(["November 2026", "Nov 2026", "Nov"])
    expect(agendaTitles(agendaWindowFrom(new Date(2026, 9, 31)))[0]).toBe("Saturday 31 October 2026")
  })

  it("says what an empty window holds, and 'coming up' only from today on", () => {
    const today = new Date(2026, 9, 13, 9)
    const first = agendaWindowFrom(today)
    expect(agendaEmptyTitle(first, today)).toBe("Nothing coming up this month")
    expect(agendaEmptyTitle(nextAgendaWindow(first), today)).toBe("Nothing in November")
    expect(agendaEmptyTitle(previousAgendaWindow(first), today)).toBe("Nothing from 1 to 12 October")
  })
})
