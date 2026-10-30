import { renderHook } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { useStableRows } from "./stableRows"

// The sidebar rebuilt its rows as new objects on every render (from the store
// and the path), so SideNavLink's memo never held: every row drew again on
// every navigation (fluid-01, FLUIDITY-LEAD 20 Oct 2026).

type Row = { path: string; title: string; variant: string; people?: { id: string }[] }
const key = (r: Row) => r.path
const ann = { id: "ann" }
const rows = (active: string, people = [ann]): Row[] => [
  { path: "/a", title: "A", variant: active === "/a" ? "sidebarActive" : "ghost" },
  { path: "/b", title: "B", variant: active === "/b" ? "sidebarActive" : "ghost", people: [...people] },
  { path: "/c", title: "C", variant: active === "/c" ? "sidebarActive" : "ghost" },
]

describe("rows kept across renders", () => {
  it("keep their objects, and the list its identity, while every field holds", () => {
    const { result, rerender } = renderHook(({ list }) => useStableRows(list, key), { initialProps: { list: rows("/a") } })
    const first = result.current
    // Rebuilt from scratch, a new array of people included: nothing changed.
    rerender({ list: rows("/a") })
    expect(result.current).toBe(first)
    expect(result.current[1]).toBe(first[1])
  })

  it("give a new object only to a row whose fields changed", () => {
    const { result, rerender } = renderHook(({ list }) => useStableRows(list, key), { initialProps: { list: rows("/a") } })
    const first = result.current
    rerender({ list: rows("/b") })
    expect(result.current).not.toBe(first)
    expect(result.current[0]).not.toBe(first[0])
    expect(result.current[1]).not.toBe(first[1])
    expect(result.current[2]).toBe(first[2])
    expect(result.current.map((r) => r.variant)).toEqual(["ghost", "sidebarActive", "ghost"])
    // A person who isn't the same object is a change.
    const before = result.current
    rerender({ list: rows("/b", [{ id: "ann" }]) })
    expect(result.current[1]).not.toBe(before[1])
    expect(result.current[0]).toBe(before[0])
  })

  it("follow rows that come, go and move", () => {
    const { result, rerender } = renderHook(({ list }) => useStableRows(list, key), { initialProps: { list: rows("/a") } })
    const [a, , c] = result.current
    const moved = rows("/a").reverse().filter((r) => r.path !== "/b")
    rerender({ list: [...moved, { path: "/d", title: "D", variant: "ghost" }] })
    expect(result.current.map((r) => r.path)).toEqual(["/c", "/a", "/d"])
    expect(result.current[0]).toBe(c)
    expect(result.current[1]).toBe(a)
  })

  // The week's blocks (fluid-10): an item read again is a new object all
  // through, nested times included, so a field-by-field compare never holds.
  // A caller says what "the same" is: here, the same JSON.
  it("keep a row by the caller's own sameness", () => {
    type Block = { uuid: string; when: { start: string }; title: string }
    const json = (a: Block, b: Block) => JSON.stringify(a) === JSON.stringify(b)
    const blocks = (title: string): Block[] => [
      { uuid: "e1", when: { start: "09:00" }, title: "Standup" },
      { uuid: "e2", when: { start: "11:00" }, title },
    ]
    const { result, rerender } = renderHook(({ list }) => useStableRows(list, (b) => b.uuid, json), { initialProps: { list: blocks("Review") } })
    const first = result.current
    rerender({ list: blocks("Review") })
    expect(result.current).toBe(first)
    rerender({ list: blocks("Design review") })
    expect(result.current[0]).toBe(first[0])
    expect(result.current[1]).not.toBe(first[1])
    expect(result.current[1].title).toBe("Design review")
  })

  it("are what the week hands its blocks", () => {
    const week = readFileSync(join(__dirname, "..", "..", "components/calendar/weekView.tsx"), "utf8")
    expect(week).toMatch(/useStableRows\(/)
    expect(week).not.toMatch(/function useStableItems/)
  })

  it("are what the computer's sidebar hands its rows", () => {
    const bar = readFileSync(join(__dirname, "..", "..", "components/navigationBar/desktop/desktopNavigationBar.tsx"), "utf8")
    for (const list of ["projectRows", "starredRows", "channelRows", "dmRows", "primary"]) expect(bar, list).toMatch(new RegExp(`${list} = useStableRows\\(`))
  })
})
