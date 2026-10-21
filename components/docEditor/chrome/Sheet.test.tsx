import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The layout's own rule, as the provider reads it: the window under 640px.
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: window.innerWidth < 640, isTablet: false, isDesktop: window.innerWidth >= 640 }) }))

import { SCREENS, putOnScreen, type ScreenName } from "@/lib/testing/screens"
import { ChromeSheet } from "./Sheet"

// The page chrome's dialogs (B6: share, move, lock, owner, customise): the
// phone's sheet, or a dialog. ONE SHEET RULE (20 Oct 2026): a phone held
// sideways is 844px wide, so isMobile said no and it got the centred dialog;
// it is the sheet by components/ui/overlayMode's useSheetMode.

let off = () => {}
const on = (s: ScreenName) => {
  off = putOnScreen(SCREENS[s])
}
afterEach(() => {
  cleanup()
  off()
  off = () => {}
})

const share = () =>
  render(
    <ChromeSheet title="Share this doc" description="Who can open it." onClose={() => {}} footer={<button type="button">Done</button>} data-share-dialog="">
      <p>Sam Rivera</p>
    </ChromeSheet>,
  )

describe("a page chrome dialog, by screen", () => {
  for (const s of ["a phone in portrait", "a phone in landscape"] as const) {
    it(`is the sheet on ${s}, its buttons under the body`, () => {
      on(s)
      share()
      const sheet = document.querySelector("[data-share-dialog]")
      expect(sheet?.hasAttribute("data-v3-sheet")).toBe(true)
      expect(sheet?.contains(screen.getByRole("button", { name: "Done" }))).toBe(true)
      // The buttons in the sheet's pinned footer; the body its one scroller, a block of sections at their own height.
      expect(screen.getByRole("button", { name: "Done" }).closest("[data-sheet-footer]")).toBeTruthy()
      expect(screen.getByText("Sam Rivera").closest("[data-overlay-body]")).toBeTruthy()
      expect(screen.getByText("Sam Rivera").compareDocumentPosition(screen.getByRole("button", { name: "Done" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  }

  it("is a dialog on a tablet", () => {
    on("a tablet")
    share()
    expect(document.querySelector("[data-share-dialog]")?.hasAttribute("data-v3-sheet")).toBe(false)
    expect(screen.getByRole("dialog", { name: "Share this doc" })).toBeTruthy()
  })
})
