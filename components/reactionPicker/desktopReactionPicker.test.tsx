import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// SD-BUG-4: a search that found nothing showed a "Search Results" heading over
// nothing; the picker's headings were Title Case with "&" (SD-40).

const thumbsUp = { id: "+1", name: "Thumbs up", native: "👍", unified: "1f44d", shortcodes: ":+1:" }
let searchResults: unknown[] = []

vi.mock("@/hooks/reactions/useReactionsData", () => ({
  useReactionsData: () => ({
    categories: [{ id: "people", reactionIds: ["+1"] }],
    reactions: { "+1": { id: "+1", name: "Thumbs up", keywords: [], skins: [{ native: "👍", unified: "1f44d", shortcodes: ":+1:" }] } },
    emoticons: {},
    aliases: {},
  }),
}))
vi.mock("@/hooks/reactions/useFrequentlyUsedReactions", () => ({
  useFrequentlyUsedReactions: () => ({ frequentlyUsedReactions: [thumbsUp] }),
  useAddFrequentlyUsedReaction: () => ({ addReactionIdToFrequents: vi.fn() }),
}))
vi.mock("@/hooks/reactions/useSearchReactions", () => ({
  useSearchReactions: () => ({ reactionSearchResults: searchResults }),
}))

const { DesktopReactionPicker } = await import("./DesktopReactionPicker")
const { getReactionCategoryLabel } = await import("@/types/reaction")

afterEach(() => {
  cleanup()
  searchResults = []
})

describe("the emoji picker", () => {
  it("says a search found nothing, under no heading", () => {
    const onSelect = vi.fn()
    render(<DesktopReactionPicker onReactionSelect={onSelect} />)
    const field = screen.getByRole("textbox", { name: "Search emoji" })
    fireEvent.change(field, { target: { value: "zzqqxy" } })

    expect(screen.getByRole("status").textContent).toBe("No emoji called “zzqqxy”")
    expect(screen.queryByText("Search results")).toBeNull()
    // Enter with nothing to pick picks nothing, and doesn't throw.
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("heads what a search found, and says nothing about finding nothing", () => {
    searchResults = [thumbsUp]
    render(<DesktopReactionPicker onReactionSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole("textbox", { name: "Search emoji" }), { target: { value: "thumb" } })

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("names its groups in sentence case, with words for “&”", () => {
    expect(["search", "frequent", "people", "nature", "foods", "places"].map(getReactionCategoryLabel)).toEqual([
      "Search results",
      "Frequently used",
      "Smileys and people",
      "Animals and nature",
      "Food and drink",
      "Travel and places",
    ])
  })
})
