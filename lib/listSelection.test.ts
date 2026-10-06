import { describe, expect, it, vi } from "vitest"
import { createSelectionStore } from "./listSelection"

describe("a list's selection", () => {
  it("picks, unpicks, adds runs and clears", () => {
    const s = createSelectionStore()
    s.toggle("a")
    s.toggle("b")
    s.toggle("a")
    expect([...s.get().selected]).toEqual(["b"])
    expect(s.get().anchor).toBe("a")
    s.addRun(["c", "d"])
    expect([...s.get().selected].sort()).toEqual(["b", "c", "d"])
    s.clear()
    expect(s.get().selected.size).toBe(0)
  })

  it("tells listeners only when something changed", () => {
    const s = createSelectionStore()
    const heard = vi.fn()
    s.subscribe(heard)
    s.highlight("a")
    s.highlight("a")
    s.clear()
    s.addRun([])
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it("lets go of tasks that are no longer listed", () => {
    const s = createSelectionStore()
    s.toggle("a")
    s.toggle("b")
    s.highlight("b")
    s.keepOnly(new Set(["a"]))
    expect([...s.get().selected]).toEqual(["a"])
    expect(s.get().highlighted).toBeNull()
  })
})
