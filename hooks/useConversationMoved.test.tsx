import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { useConversationMoved } from "@/hooks/useConversationMoved"
import { applyConversationAccess } from "@/lib/mqtt/conversationAccess"
import type { ScopedMutator } from "swr"

afterEach(cleanup)

// Adding someone to a group gives it a new id (its members' hash). A view open
// on the old id showed a group nothing was sent to any more: it moves.
describe("a group open on the id it had", () => {
  const moved = (to: string, from: string) =>
    act(() =>
      applyConversationAccess(
        { kind: "group", id: to, change: "added", previous_id: from },
        { refreshTopics: () => {}, mutate: vi.fn() as unknown as ScopedMutator },
      ),
    )

  it("moves to the new one", () => {
    const onMoved = vi.fn()
    renderHook(() => useConversationMoved("group", "grp-old", onMoved))
    moved("grp-new", "grp-old")
    expect(onMoved).toHaveBeenCalledWith("grp-new")
  })

  it("stays put when another group moved", () => {
    const onMoved = vi.fn()
    renderHook(() => useConversationMoved("group", "grp-mine", onMoved))
    moved("grp-new", "grp-old")
    expect(onMoved).not.toHaveBeenCalled()
  })

  it("isn't followed by something that isn't a group", () => {
    const onMoved = vi.fn()
    renderHook(() => useConversationMoved(null, "grp-old", onMoved))
    moved("grp-new", "grp-old")
    expect(onMoved).not.toHaveBeenCalled()
  })
})
