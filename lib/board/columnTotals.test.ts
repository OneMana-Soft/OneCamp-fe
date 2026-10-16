import { describe, expect, it } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { columnTotals, openTotal } from "@/lib/board/columnTotals"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { useOpenLimit } from "@/hooks/useClosedLimit"

// PROJ-BUG-8: the server counts every board column, so an open column of
// 2,500 to-dos says 2,500 and pages, instead of stopping at 1,000 unsaid.

describe("columnTotals", () => {
  it("takes the server's count for every column, custom statuses included", () => {
    const counts = { backlog: 0, todo: 2500, inProgress: 12, inReview: 0, done: 40, canceled: 3, "ready-id": 700 }
    expect(columnTotals(counts, { done: 999, canceled: 999 })).toEqual(counts)
  })

  it("keeps the closed columns' counts from a server that sends no others", () => {
    expect(columnTotals(undefined, { done: 812, canceled: 4 })).toEqual({ done: 812, canceled: 4 })
  })
})

describe("useOpenLimit", () => {
  it("sends nothing for the first page, then 1,000 more a time, up to 5,000", () => {
    const { result } = renderHook(() => useOpenLimit())
    expect(result.current.param).toBe("")
    act(() => result.current.showMore())
    expect(result.current.param).toBe("openLimit=2000")
    for (let i = 0; i < 6; i++) act(() => result.current.showMore())
    expect(result.current.param).toBe("openLimit=5000")
  })
})

describe("openTotal", () => {
  const ready = { value: "ready-id", category: "todo" }
  const shipped = { value: "shipped-id", category: "done" }
  const counts = { backlog: 1, todo: 2500, inProgress: 12, inReview: 0, done: 40, canceled: 3, "ready-id": 700, "shipped-id": 9 }

  it("adds up every open column, custom statuses by their category", () => {
    expect(openTotal(counts, [...BUILT_IN_STATUSES, ready, shipped])).toBe(1 + 2500 + 12 + 0 + 700)
  })

  it("says nothing until every column's status is known", () => {
    expect(openTotal(counts, BUILT_IN_STATUSES)).toBeUndefined()
    expect(openTotal(undefined, BUILT_IN_STATUSES)).toBeUndefined()
  })
})
