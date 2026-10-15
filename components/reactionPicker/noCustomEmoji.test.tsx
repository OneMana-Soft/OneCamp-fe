import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

// The pickers offered a "Custom" group of a workspace's own emoji. There is
// no store of them, and the group asked for them with an empty address, so it
// never loaded. The shared list of groups has none now, on any picker.

vi.mock("@/hooks/reactions/useFrequentlyUsedReactions", () => ({
  useFrequentlyUsedReactions: () => ({ frequentlyUsedReactions: [] }),
  useAddFrequentlyUsedReaction: () => ({ addReactionIdToFrequents: () => {} }),
}))

const { ALL_REACTION_CATEGORIES, getReactionCategoryLabel } = await import("@/types/reaction")
const { EmojiPickerDrawer } = await import("@/components/drawers/emojiPickerDrawer")

afterEach(cleanup)

describe("the emoji pickers", () => {
  it("offer no Custom group", async () => {
    expect(ALL_REACTION_CATEGORIES).not.toContain("custom")
    expect(ALL_REACTION_CATEGORIES.map(getReactionCategoryLabel)).not.toContain("Custom")

    // The phone's picker, even when asked for a workspace's own emoji.
    render(<EmojiPickerDrawer reactionDrawerOpenState setReactionDrawerOpenState={() => {}} showCustomReactions onReactionSelect={() => {}} />)
    await waitFor(() => expect(screen.getAllByRole("heading").map((h) => h.textContent)).toContain("Smileys and people"), { timeout: 5000 })
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).not.toContain("Custom")
  })
})
