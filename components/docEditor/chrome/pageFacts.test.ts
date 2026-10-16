import { describe, expect, it, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { factsOf, leaveDoc, navigate, provideNavigate, setFacts, softLocked, usePageFacts } from "./pageFacts"

describe("what the open doc's page knows (B6)", () => {
  it("changes only when a fact does, and tells whoever follows it", () => {
    const { result } = renderHook(() => usePageFacts("f1"))
    expect(result.current).toEqual({})
    act(() => setFacts("f1", { lock: "soft", owner: true }))
    expect(result.current).toEqual({ lock: "soft", owner: true })
    const before = factsOf("f1")
    setFacts("f1", { lock: "soft" })
    expect(factsOf("f1")).toBe(before)
    expect(factsOf("f2")).toEqual({})
  })

  it("holds an editor under a soft lock until it is lifted for them, and forgets the doc when they leave", () => {
    setFacts("f3", { lock: "soft" })
    expect(softLocked(factsOf("f3"))).toBe(true)
    setFacts("f3", { unlockedForMe: true })
    expect(softLocked(factsOf("f3"))).toBe(false)
    // Leaving forgets the doc altogether; the next open reads its lock again.
    leaveDoc("f3")
    expect(factsOf("f3")).toEqual({})
    setFacts("f3", { lock: "soft" })
    expect(softLocked(factsOf("f3"))).toBe(true)
    // A hard lock is the server's: nothing here holds the editor for it.
    expect(softLocked({ lock: "hard" })).toBe(false)
    expect(softLocked({})).toBe(false)
  })

  it("navigates through the page's router once it has one", () => {
    const push = vi.fn()
    provideNavigate(push)
    navigate("/app/doc/x")
    expect(push).toHaveBeenCalledWith("/app/doc/x")
    provideNavigate(null)
  })
})
