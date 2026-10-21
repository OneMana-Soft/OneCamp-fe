import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { GroupedReaction } from "@/types/reaction"

const toasts: unknown[] = []
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: unknown) => toasts.push(t) }) }))
const { useMessageReactions } = await import("./useMessageReactions")

// The one hook every message row uses for its reactions (chat B25). The rule
// each row had was the reader's one reaction, found and replaced: a second
// emoji was sent with the first one's id, and the server changed it.

const ME = "me-uuid"
const r = (uid: string, emoji: string, who: string): GroupedReaction =>
  ({ uid, reaction_emoji_id: emoji, reaction_added_by: { user_uuid: who, user_name: who }, reaction_added_at: "", reaction_on_content_added_by: {} }) as unknown as GroupedReaction

afterEach(() => {
  cleanup()
  toasts.length = 0
})

describe("a row's reactions", () => {
  it("add a second emoji as its own reaction, never in the first one's place", () => {
    const add = vi.fn()
    const remove = vi.fn()
    const { result } = renderHook(() => useMessageReactions([r("1", "+1", ME)], ME, add, remove))
    act(() => result.current.toggle("tada"))
    expect(add).toHaveBeenCalledWith("tada", "")
    expect(remove).not.toHaveBeenCalled()
    expect([...result.current.selected]).toEqual(["+1"])
  })

  it("take back the reader's own on a second click", () => {
    const add = vi.fn()
    const remove = vi.fn()
    const { result } = renderHook(() => useMessageReactions([r("1", "+1", ME), r("2", "tada", ME), r("3", "tada", "maya")], ME, add, remove))
    act(() => result.current.toggle("tada"))
    expect(remove).toHaveBeenCalledWith("2")
    expect(add).not.toHaveBeenCalled()
    expect(result.current.byEmoji).toEqual({ "+1": [ME], tada: [ME, "maya"] })
  })

  it("burst on the reader's first reaction only", () => {
    const { result, rerender } = renderHook(({ list }) => useMessageReactions(list, ME, vi.fn(), vi.fn()), { initialProps: { list: [] as GroupedReaction[] } })
    act(() => result.current.toggle("+1"))
    expect(result.current.burstEmojiId).toBe("+1")
    rerender({ list: [r("1", "+1", ME)] })
    act(() => result.current.toggle("tada"))
    expect(result.current.burstEmojiId).toBe("+1")
  })

  it("say why at a cap, and send nothing", () => {
    const add = vi.fn()
    const mine = Array.from({ length: 23 }, (_, i) => r(`m${i}`, `e${i}`, ME))
    const { result } = renderHook(() => useMessageReactions(mine, ME, add, vi.fn()))
    act(() => result.current.toggle("rocket"))
    expect(add).not.toHaveBeenCalled()
    expect(toasts).toEqual([{ title: "That's the most reactions you can add", description: "You can add up to 23 reactions to one message." }])
  })
})
