import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// On a phone the responsive dialog is the shared sheet, and the sheet hugs
// what it holds: a short step's footer sits under its last field, and only a
// long one grows to the sheet's most (92dvh) and scrolls its body. A wide
// dialog's sheet was the large detent, 92dvh tall whatever it held, so the
// guided run's invite step left about 380px of blank sheet above its footer
// (DESIGN-BUILD-2, 20 Oct).
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))
const { ResponsiveDialog } = await import("./responsive-dialog")

afterEach(cleanup)

describe("the responsive dialog on a phone", () => {
  it.each([false, true])("hugs what it holds, wide = %s", async (wide) => {
    render(
      <ResponsiveDialog title="Invite your team" footer={<button type="button">Send invitation</button>} onClose={() => {}} wide={wide}>
        <p>Add their addresses.</p>
      </ResponsiveDialog>,
    )
    // Its frame stands in while the chunk loads (sheetFrame); this is the sheet.
    const sheet = (await screen.findByText("Add their addresses.")).closest("[data-v3-sheet]")
    expect(sheet?.getAttribute("data-detent")).toBe("medium")
    expect(sheet?.className.split(/\s+/)).not.toContain("h-[92dvh]")
  })
})

// A sheet over a call stands on the call's dark surface in either theme
// (DESIGN-BUILD-4, 22 Oct): the sheet takes its caller's surface class, and
// nobody else's sheet changes.
describe("the responsive sheet's surface", () => {
  it("takes the caller's surface, and has none of its own otherwise", async () => {
    const { default: ResponsiveSheet } = await import("./responsive-sheet")
    const { unmount } = render(
      <ResponsiveSheet title="Invite to this call" footer={<button type="button">Make an invite link</button>} onClose={() => {}} className="dark">
        <p>Anyone with the link can ask to come in.</p>
      </ResponsiveSheet>,
    )
    expect((await screen.findByRole("dialog")).closest("[data-v3-sheet]")?.classList.contains("dark")).toBe(true)
    unmount()
    render(
      <ResponsiveDialog title="Invite your team" footer={<button type="button">Send invitation</button>} onClose={() => {}}>
        <p>Add their addresses.</p>
      </ResponsiveDialog>,
    )
    expect((await screen.findByText("Add their addresses.")).closest("[data-v3-sheet]")?.classList.contains("dark")).toBe(false)
  })
})
