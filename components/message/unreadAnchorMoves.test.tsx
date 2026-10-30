import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { READ_MOVED_EVENT, useUnreadAnchor } from "./useUnreadAnchor"

type M = { id: string; by: string }
const msgs: M[] = [{ id: "m1", by: "bea" }, { id: "m2", by: "bea" }, { id: "m3", by: "me" }, { id: "m4", by: "bea" }]
const mine = (m: M) => m.by === "me"
const key = (m: M) => `k-${m.id}`
const moved = (id: string, first: string) =>
  act(() => void window.dispatchEvent(new CustomEvent(READ_MOVED_EVENT, { detail: { id, first_unread: first } })))

// The "New" line (chat B27): where the sidebar's count put it on opening, and
// where a Mark unread here or on another tab moves it while the conversation
// is open (read.moved).
describe("the New line", () => {
  it("starts above the unread the conversation opened with", () => {
    const { result } = renderHook(() => useUnreadAnchor(msgs, 1, mine, key, { conversation: "c1", idOf: (m) => m.id }))
    expect(result.current).toBe("k-m4")
  })

  it("moves to the message marked unread in this conversation, and only this one", () => {
    const { result } = renderHook(() => useUnreadAnchor(msgs, 0, mine, key, { conversation: "c1", idOf: (m) => m.id }))
    expect(result.current).toBeNull()
    moved("c2", "m2")
    expect(result.current).toBeNull()
    moved("c1", "m2")
    expect(result.current).toBe("k-m2")
  })
})

// Opened by its address, the conversation doesn't know yet how many were
// unread (hooks/useUnreadOnOpen): the line waits, rather than fixing itself
// at none before the count comes.
describe("the New line, opened by its address", () => {
  it("waits for the count, then sits above the unread", () => {
    const { result, rerender } = renderHook(({ n }: { n: number | undefined }) => useUnreadAnchor(msgs, n, mine, key), {
      initialProps: { n: undefined as number | undefined },
    })
    expect(result.current).toBeNull()
    rerender({ n: 1 })
    expect(result.current).toBe("k-m4")
  })
})
