import { afterEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import { noteReaction, quickReactions, readRecentReactions, type QuickReaction } from "./recentReactions"

// The whole store, loaded once with the file rather than inside a test's five
// seconds: on a busy machine its import alone ran past them.
const { default: store } = await import("@/store/store")
const { useAddFrequentlyUsedReaction } = await import("@/hooks/reactions/useFrequentlyUsedReactions")

// MC-77: a message's quick reactions were always ✅ 👀 🙌. They are the
// reactions you used last, topped up from those.

const DEFAULTS: QuickReaction[] = [
  { id: "white_check_mark", native: "✅", label: "Mark as done" },
  { id: "eyes", native: "👀", label: "Take a look" },
  { id: "raised_hands", native: "🙌", label: "Nice work" },
]

afterEach(() => localStorage.clear())

describe("recent reactions", () => {
  it("keep the last six used, newest first, each once", () => {
    for (const [id, native] of [["rocket", "🚀"], ["tada", "🎉"], ["+1", "👍"], ["heart", "❤️"], ["fire", "🔥"], ["100", "💯"], ["pray", "🙏"], ["tada", "🎉"]]) {
      noteReaction({ id, native, name: id })
    }
    expect(readRecentReactions().map((r) => r.id)).toEqual(["tada", "pray", "100", "fire", "heart", "+1"])
  })

  it("leave out a custom reaction, which has no character to draw", () => {
    noteReaction({ id: "partyparrot" })
    expect(readRecentReactions()).toEqual([])
  })

  it("are none when what is stored isn't a list of them", () => {
    localStorage.setItem("onecamp-recent-reactions", "{not json")
    expect(readRecentReactions()).toEqual([])
    localStorage.setItem("onecamp-recent-reactions", JSON.stringify([{ id: "x" }, null, 3]))
    expect(readRecentReactions()).toEqual([])
  })

  it("fill the quick slots first, then the defaults, keeping a default's own name", () => {
    expect(quickReactions([], DEFAULTS, 3)).toEqual(DEFAULTS)
    const recent: QuickReaction[] = [
      { id: "rocket", native: "🚀", label: "Rocket" },
      { id: "white_check_mark", native: "✅", label: "Check Mark Button" },
    ]
    expect(quickReactions(recent, DEFAULTS, 3)).toEqual([recent[0], DEFAULTS[0], DEFAULTS[1]])
  })

  it("are noted by the pickers, which share one hook", () => {
    const { result } = renderHook(() => useAddFrequentlyUsedReaction(), { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })
    result.current.addReactionIdToFrequents({ id: "rocket", native: "🚀", name: "Rocket" })
    expect(readRecentReactions()).toEqual([{ id: "rocket", native: "🚀", label: "Rocket" }])
  })
})
