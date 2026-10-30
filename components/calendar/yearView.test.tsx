import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { YearView, heatOf, yearItems } from "./yearView"
import type { MonthItem } from "./monthView"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()
afterEach(cleanup)

const at = (m: number, d: number, h = 9) => new Date(2026, m, d, h).toISOString()
const ev = (id: string, m: number, d: number, more: Partial<MonthItem> = {}): MonthItem => ({ event_uuid: id, event_title: id, event_start_time: at(m, d), event_end_time: at(m, d, 10), ...more })
/** What the calendar hands a view: each day's items by its key. */
const byDayOf = (items: MonthItem[]) => {
  const map = new Map<string, MonthItem[]>()
  for (const it of items) {
    const k = it.event_start_time.slice(0, 10)
    const day = new Date(it.event_start_time)
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
    map.set(key || k, [...(map.get(key) || []), it])
  }
  return map
}
const year = (items: MonthItem[], props: Partial<Parameters<typeof YearView>[0]> = {}) => {
  const onDay = vi.fn()
  const onMonth = vi.fn()
  render(<YearView year={new Date(2026, 9, 21)} byDay={byDayOf(items)} today="2026-10-21" weekStartsOn={1} onDay={onDay} onMonth={onMonth} {...props} />)
  return { onDay, onMonth, day: (key: string) => document.querySelector(`[data-year-day="${key}"]`) as HTMLElement }
}

describe("how busy a day reads", () => {
  it("steps from nothing to 6 and more", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 12].map(heatOf)).toEqual([0, 1, 2, 2, 3, 3, 4, 4])
  })

  it("counts a task on the day it's due, not every day it spans", () => {
    const task = ev("Ship", 9, 1, { isTask: true, event_end_time: at(9, 3) })
    const map = new Map([["2026-10-01", [task]], ["2026-10-03", [task]]])
    expect(yearItems(map, new Date(2026, 9, 1))).toEqual([])
    expect(yearItems(map, new Date(2026, 9, 3))).toEqual([task])
  })
})

describe("the year", () => {
  it("draws its twelve months in the week's order, each day once", () => {
    year([])
    expect(document.querySelectorAll("[data-year-month]")).toHaveLength(12)
    expect(document.querySelectorAll("[data-year-day]")).toHaveLength(365)
    expect(screen.getByRole("region", { name: "October 2026" })).toBeTruthy()
  })

  it("shades a day by how much is on it, outlines a day away, and rings today", () => {
    const { day } = year([ev("a", 2, 4), ev("b", 2, 4), ev("c", 2, 4), ev("d", 5, 1), ev("Leave", 6, 14, { event_is_away: true })])
    expect(day("2026-03-04").dataset.heat).toBe("2")
    expect(day("2026-06-01").dataset.heat).toBe("1")
    expect(day("2026-06-02").dataset.heat).toBeUndefined()
    expect(day("2026-07-14").dataset.away).toBe("true")
    expect(day("2026-03-04").getAttribute("aria-label")).toBe("Wednesday 4 March: 3 items")
    expect(day("2026-10-21").getAttribute("aria-current")).toBe("date")
  })

  it("opens a day from it, and a month from its name", () => {
    const { onDay, onMonth, day } = year([])
    fireEvent.click(day("2026-03-04"))
    expect(onDay).toHaveBeenCalledWith(new Date(2026, 2, 4))
    fireEvent.click(screen.getByRole("button", { name: "July" }))
    expect(onMonth).toHaveBeenCalledWith(new Date(2026, 6, 1))
  })

  it("is one stop for Tab, today, and the arrows go a day or a week", () => {
    const { day } = year([])
    expect([...document.querySelectorAll("[data-year-day]")].filter((b) => (b as HTMLElement).tabIndex === 0).map((b) => (b as HTMLElement).dataset.yearDay)).toEqual(["2026-10-21"])
    day("2026-10-21").focus()
    fireEvent.keyDown(day("2026-10-21"), { key: "ArrowRight" })
    expect(document.activeElement).toBe(day("2026-10-22"))
    fireEvent.keyDown(day("2026-10-22"), { key: "ArrowUp" })
    expect(document.activeElement).toBe(day("2026-10-15"))
  })

  it("lists what a day holds while it is hovered: five, then how many more", () => {
    const busy = Array.from({ length: 7 }, (_, i) => ev(`Meeting ${i + 1}`, 9, 21))
    const { day } = year(busy)
    act(() => void fireEvent.pointerOver(day("2026-10-21")))
    const card = document.querySelector("[data-year-card]") as HTMLElement
    expect(card.textContent).toContain("Wed 21 Oct")
    expect(card.querySelectorAll("[data-hue-block]")).toHaveLength(5)
    expect(card.textContent).toContain("+2 more")
    act(() => void fireEvent.pointerLeave(document.querySelector("[data-year]")!))
    expect(document.querySelector("[data-year-card]")).toBeNull()
  })
})
