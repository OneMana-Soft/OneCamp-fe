import { describe, expect, it } from "vitest"

import { drawnIndexes, firstScreen, layFlow, planGroups, type FlowItem } from "./windowedRows"

// The windowed list's geometry (lib/ui/windowedRows.ts): a grouped flow laid
// out, and what each group draws with the space around it.

/** A group: its 36 px header, then its rows (40 px) and a 36 px "Show N more". */
const group = (key: string, rows: number, more = false): FlowItem[] => [
  { key: `${key}:header`, group: key, header: true, size: 36 },
  ...Array.from({ length: rows }, (_, i) => ({ key: `${key}-${i}`, group: key, size: 40 })),
  ...(more ? [{ key: `${key}:more`, group: key, size: 36 }] : []),
]

describe("a windowed list's geometry", () => {
  it("lays a grouped flow out: each item's top, the whole height, each key's index", () => {
    const flow = layFlow([...group("todo", 3), ...group("done", 2, true)])
    expect(flow.starts).toEqual([0, 36, 76, 116, 156, 192, 232, 272])
    expect(flow.total).toBe(308)
    expect(flow.index.get("done-1")).toBe(6)
  })

  it("draws the window and the kept items, once each, in order", () => {
    expect(drawnIndexes(100, { first: 40, last: 44 }, [3, 42, 99, 120])).toEqual([3, 40, 41, 42, 43, 44, 99])
    expect(drawnIndexes(10, null, [2])).toEqual([2])
  })

  it("pads each group's list before and after the window, and a group out of view keeps its whole height", () => {
    const flow = layFlow([...group("todo", 100), ...group("doing", 100), ...group("done", 5, true)])
    // The window from todo's row 90 into doing's row 9.
    const first = flow.index.get("todo-90")!
    const last = flow.index.get("doing-9")!
    const plans = planGroups(flow, drawnIndexes(flow.items.length, { first, last }, []))
    const todo = plans.get("todo")!
    expect(todo.before).toBe(90 * 40)
    expect(todo.after).toBe(0)
    expect(todo.drawn.map((d) => d.key)).toEqual(Array.from({ length: 10 }, (_, i) => `todo-${90 + i}`))
    const doing = plans.get("doing")!
    expect(doing.before).toBe(0)
    expect(doing.after).toBe(90 * 40)
    expect(doing.drawn).toHaveLength(10)
    // Done, below the window: nothing drawn, its list's whole height (5 rows and "Show N more") kept.
    expect(plans.get("done")).toEqual({ before: 5 * 40 + 36, after: 0, drawn: [] })
    // Every group's height is what it was, drawn or not.
    for (const [key, plan] of plans) {
      const items = flow.items.filter((it) => it.group === key && !it.header)
      const drawnHeight = plan.drawn.reduce((s, d) => s + d.gap + flow.items[flow.index.get(d.key)!].size, 0)
      expect(plan.before + drawnHeight + plan.after).toBe(items.reduce((s, it) => s + it.size, 0))
    }
  })

  it("draws a kept row far from the window with the space above it as its own margin", () => {
    const flow = layFlow(group("todo", 500))
    // The opened row is the 6th; the window is down at rows 300 to 309.
    const kept = flow.index.get("todo-5")!
    const plans = planGroups(flow, drawnIndexes(flow.items.length, { first: flow.index.get("todo-300")!, last: flow.index.get("todo-309")! }, [kept]))
    const todo = plans.get("todo")!
    expect(todo.before).toBe(5 * 40)
    expect(todo.drawn[0]).toEqual({ key: "todo-5", gap: 0 })
    expect(todo.drawn[1]).toEqual({ key: "todo-300", gap: (300 - 6) * 40 })
    expect(todo.drawn.slice(2).every((d) => d.gap === 0)).toBe(true)
    expect(todo.after).toBe((500 - 310) * 40)
  })

  it("skips headers among the drawn, as they are always drawn, and draws a first screen before the window is known", () => {
    const flow = layFlow([...group("todo", 30), ...group("done", 5)])
    const screen = firstScreen(flow, 400)
    // The header (0) and rows 0 to 9: row 9 starts at 396 px, inside the 400.
    expect(screen).toEqual({ first: 0, last: 10 })
    const plans = planGroups(flow, drawnIndexes(flow.items.length, screen, []))
    expect(plans.get("todo")!.drawn.map((d) => d.key)).toEqual(Array.from({ length: 10 }, (_, i) => `todo-${i}`))
    expect(plans.get("todo")!.after).toBe(20 * 40)
  })
})
