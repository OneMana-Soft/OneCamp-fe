import { describe, expect, it } from "vitest"
import splitSlice, { closeSplit, openInSplit, setActive, setFocused } from "./splitSlice"
import { MAIN } from "@/lib/split"

const r = splitSlice.reducer
const a = { kind: "doc" as const, id: "aaaaaa" }, b = { kind: "chat" as const, id: "bbbbbb" }

describe("splitSlice", () => {
  it("makes a pane it opens the active view", () => {
    const s = r(r(undefined, openInSplit(a)), openInSplit(b))
    expect(s.panes).toEqual([a, b])
    expect(s.active).toBe(1)
  })
  it("keeps active and focused pointing at the same views when one closes", () => {
    let s = r(r(undefined, openInSplit(a)), openInSplit(b))
    s = r(r(s, setActive(1)), setFocused(1))
    s = r(s, closeSplit(0))
    expect(s.panes).toEqual([b])
    expect(s.active).toBe(0)
    expect(s.focused).toBe(0)
    s = r(s, closeSplit(0))
    expect(s.active).toBe(MAIN)
    expect(s.focused).toBeNull()
  })
  it("ignores a view that isn't there", () => {
    const s = r(r(undefined, setActive(3)), setFocused(2))
    expect(s.active).toBe(MAIN)
    expect(s.focused).toBeNull()
  })
})
