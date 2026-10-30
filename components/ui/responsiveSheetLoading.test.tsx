import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// On a phone, ResponsiveDialog's sheet is a chunk of its own, loaded with the
// first one opened. Until it lands, the phone showed nothing at all: a tap on
// "Invite" did nothing for as long as the chunk took on a slow line. Now the
// sheet's frame stands in at once: the scrim, the sheet with its title, and a
// busy body. Then the real sheet takes its place.
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))

let land: () => void = () => {}
const landed = new Promise<void>((resolve) => (land = resolve))
vi.mock("@/components/ui/responsive-sheet", async () => {
  await landed
  return {
    default: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <div role="dialog" aria-label={title} data-real-sheet="">
        {children}
      </div>
    ),
  }
})

const { ResponsiveDialog } = await import("./responsive-dialog")
const { SheetFrame } = await import("./sheetFrame")

afterEach(cleanup)

describe("the responsive dialog on a phone, before its sheet's chunk lands", () => {
  // First: the chunk is held back until the last case lets it land.
  it("can be closed while it loads, by Escape or the scrim", () => {
    const onClose = vi.fn()
    render(
      <ResponsiveDialog title="Crop your photo" footer={<button type="button">Save</button>} onClose={onClose}>
        <p>The photo</p>
      </ResponsiveDialog>,
    )
    const frame = screen.getByRole("dialog", { name: "Crop your photo" })
    fireEvent.keyDown(frame, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector("[data-sheet-frame-scrim]")!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("draws the sheet's line and footer too, the footer inert, so nothing moves when the sheet lands", () => {
    render(
      <ResponsiveDialog title="Waiting for my approval" description="Open one to answer it on its card." footer={<button type="button">Close</button>} onClose={() => {}}>
        <p>Rows</p>
      </ResponsiveDialog>,
    )
    const frame = screen.getByRole("dialog", { name: "Waiting for my approval" })
    expect(frame.textContent).toContain("Open one to answer it on its card.")
    const close = frame.querySelector("button")!
    expect(close.textContent).toBe("Close")
    expect(close.closest("[inert]")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
  })

  // The sheet's footer stands on the one foot for every phone sheet's footer
  // (V-73, app/overlay.css 8b), the strip folded into it; the frame's stood
  // 16px over the strip, so the footer dropped when the sheet landed.
  it("stands its footer on the sheet's one foot, as the sheet's own footer does", () => {
    render(
      <ResponsiveDialog title="Rename the view" footer={<button type="button">Save</button>} onClose={() => {}}>
        <p>Name</p>
      </ResponsiveDialog>,
    )
    const frame = screen.getByRole("dialog", { name: "Rename the view" })
    expect(frame.getAttribute("data-overlay")).toBe("sheet")
    expect(frame.hasAttribute("data-overlay-holds-footer")).toBe(true)
    expect(frame.querySelector("button")!.closest("[data-sheet-footer]")?.parentElement).toBe(frame)
    cleanup()
    // A frame without one (a lazily loaded sheet of its own, as the long-text sheet's) says nothing.
    render(<SheetFrame title="About" onClose={() => {}} />)
    expect(screen.getByRole("dialog", { name: "About" }).hasAttribute("data-overlay-holds-footer")).toBe(false)
  })

  it("shows the sheet's frame at once, titled and busy, then the sheet", async () => {
    render(
      <ResponsiveDialog title="Invite people" footer={<button type="button">Send</button>} onClose={() => {}}>
        <p>Who works with you?</p>
      </ResponsiveDialog>,
    )
    const frame = screen.getByRole("dialog", { name: "Invite people" })
    expect(frame.getAttribute("aria-busy")).toBe("true")
    expect(frame.getAttribute("data-overlay")).toBe("sheet")
    expect(document.activeElement).toBe(frame)

    await act(async () => {
      land()
      await landed
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(await screen.findByText("Who works with you?")).toBeTruthy()
    expect(screen.getByRole("dialog", { name: "Invite people" }).hasAttribute("data-real-sheet")).toBe(true)
  })
})
