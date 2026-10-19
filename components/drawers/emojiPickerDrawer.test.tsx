import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The phone's emoji picker (mobile.md K4). It opened at the large detent, a
// fixed 92% slab with the page pushed back, around a search box and five rows
// that scrolled sideways: "the emoji picker drawer is expanding way too much"
// (the owner, 17 Oct). The browser half is e2e/phoneSheets.spec.ts.

// One list, as the hook memoises it.
const frequent = [{ id: "+1", name: "Thumbs Up", native: "👍" }]
vi.mock("@/hooks/reactions/useFrequentlyUsedReactions", () => ({
  useFrequentlyUsedReactions: () => ({ frequentlyUsedReactions: frequent }),
  useAddFrequentlyUsedReaction: () => ({ addReactionIdToFrequents: () => {} }),
}))

const { EmojiPickerDrawer } = await import("./emojiPickerDrawer")

afterEach(cleanup)

const open = () => render(<EmojiPickerDrawer reactionDrawerOpenState setReactionDrawerOpenState={() => {}} onReactionSelect={() => {}} />)
const sheet = () => document.querySelector("[data-emoji-sheet]") as HTMLElement

describe("the phone's emoji picker", () => {
  it("is the half detent, the page left where it is", () => {
    open()
    expect(sheet().getAttribute("data-detent")).toBe("half")
    expect(sheet().className.split(/\s+/)).not.toContain("h-[92dvh]")
  })

  it("lays its groups down the sheet's one scroller in rows of 44px cells, under a bar that goes to each", { timeout: 20000 }, async () => {
    open()
    await waitFor(() => expect(document.querySelectorAll("[data-emoji-group]").length).toBeGreaterThan(5), { timeout: 8000 })
    const bar = sheet().querySelector<HTMLElement>('[role="group"][aria-label="Emoji groups"]')!
    const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-emoji-group]")).map((g) => g.getAttribute("aria-label"))
    expect(Array.from(bar.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))).toEqual(groups)
    for (const g of Array.from(document.querySelectorAll("[data-emoji-group]"))) {
      expect(g.closest("[data-sheet-body]"), "a group outside the sheet's scroller").toBeTruthy()
      expect(g.className, "a group that scrolls on its own").not.toMatch(/overflow-/)
    }
    expect(document.querySelector("[data-emoji-group] button")!.className).toContain("h-11")
    // The group pressed is the one marked. (Queried in the bar: a role query
    // over the ~1,900 cells takes jsdom half a minute.)
    const nature = bar.querySelector<HTMLElement>('[aria-label="Animals and nature"]')!
    fireEvent.click(nature)
    expect(nature.getAttribute("aria-current")).toBe("true")
  })

  it("searches in place, and says when nothing matches", { timeout: 20000 }, async () => {
    open()
    fireEvent.change(screen.getByLabelText("Search emoji"), { target: { value: "zzzqqq" } })
    await waitFor(() => expect(sheet().textContent).toMatch(/No emoji match “zzzqqq”/), { timeout: 8000 })
    expect(sheet().querySelector('[aria-label="Emoji groups"]')).toBeNull()
  })
})
