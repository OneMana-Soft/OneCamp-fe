import { describe, expect, it } from "vitest"
import { agendaDays } from "./calendarAgenda"

const d = (s: string) => new Date(s + "T12:00:00")

describe("agendaDays", () => {
  const busy = new Set(["2026-09-03", "2026-09-24", "2026-09-30"])
  const key = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
  const items = (day: Date) => (busy.has(key(day)) ? ["x"] : [])

  it("lists only the days with something on them, from today when today is in range", () => {
    const got = agendaDays(d("2026-09-01"), d("2026-09-30"), items, d("2026-09-10")).map((g) => g.day.getDate())
    expect(got).toEqual([24, 30])
  })
  it("starts at the range when today is outside it", () => {
    const got = agendaDays(d("2026-09-01"), d("2026-09-30"), items, d("2026-12-01")).map((g) => g.day.getDate())
    expect(got).toEqual([3, 24, 30])
  })
})
