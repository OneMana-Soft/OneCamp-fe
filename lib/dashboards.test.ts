import { describe, expect, it } from "vitest"
import { dashboardHref, flowPlaces, lastWeeks, metricText, moved, ordered, samePlaces, scopeWords, widgetTitle, type Widget } from "@/lib/dashboards"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const w = (id: string, x: number, y: number, wd = 6, h = 4): Widget => ({ id, kind: "throughput", title: "", query: {}, x, y, w: wd, h })

describe("dashboards", () => {
  it("lays widgets left to right, a row as tall as its tallest, one that doesn't fit starting the next", () => {
    expect(flowPlaces([{ id: "a", w: 3, h: 2 }, { id: "b", w: 6, h: 4 }, { id: "c", w: 6, h: 2 }, { id: "d", w: 20, h: 1 }])).toEqual([
      { id: "a", x: 0, y: 0, w: 3, h: 2 },
      { id: "b", x: 3, y: 0, w: 6, h: 4 },
      { id: "c", x: 0, y: 4, w: 6, h: 2 },
      { id: "d", x: 0, y: 6, w: 12, h: 1 },
    ])
  })
  it("reads row by row, left to right, and moves one widget among the rest", () => {
    const ws = [w("b", 6, 0), w("c", 0, 4), w("a", 0, 0)]
    expect(ordered(ws).map((x) => x.id)).toEqual(["a", "b", "c"])
    expect(moved(ws, 2, 0).map((p) => [p.id, p.x, p.y])).toEqual([["c", 0, 0], ["a", 6, 0], ["b", 0, 4]])
    expect(samePlaces(flowPlaces(ordered(ws)), ws)).toBe(true)
    expect(samePlaces(moved(ws, 0, 1), ws)).toBe(false)
  })
  it("names a widget by its title, or by what it shows", () => {
    expect(widgetTitle({ kind: "metric", title: " ", query: { measure: "overdue" } })).toBe("Overdue")
    expect(widgetTitle({ kind: "breakdown", title: "", query: { by: "person" } })).toBe("By person")
    expect(widgetTitle({ kind: "flow", title: "Ship flow", query: {} })).toBe("Ship flow")
  })
  it("says a number as a count, a share or a time, and None when there's nothing yet", () => {
    expect(metricText({ measure: "open", value: 1200 })).toBe((1200).toLocaleString())
    expect(metricText({ measure: "on_time", value: 66.6 })).toBe("67%")
    expect(metricText({ measure: "cycle", value: null })).toBe("None")
  })
  it("names the Mondays of the last weeks, oldest first", () => {
    expect(lastWeeks(3, new Date(2026, 10, 5, 12))).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"])
    expect(lastWeeks(1, new Date(2026, 10, 2, 9))).toEqual(["2026-11-02"])
  })
  it("addresses one dashboard, a project's list, or the page alone (one helper, CR-B4 M1)", () => {
    expect(dashboardHref("d1")).toBe("/app/project/dashboards?d=d1")
    expect(dashboardHref("d1", "p1")).toBe("/app/project/dashboards?project=p1&d=d1")
    expect(dashboardHref("", "p1")).toBe("/app/project/dashboards?project=p1")
    expect(dashboardHref("")).toBe("/app/project/dashboards")
  })
  it("says who reads a dashboard", () => {
    expect(scopeWords({ scope: "mine", shared: true })).toBe("Only you")
    expect(scopeWords({ scope: "project", shared: false })).toBe("The project's admins")
    expect(scopeWords({ scope: "workspace", shared: true })).toBe("Everyone in the workspace")
  })
})
