import * as React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// The phone sheet's frame (sheetFrame) stands in while the sheet's chunk
// loads, and focus must still come home: the frame took it and went in the
// commit that mounted the sheet, whose focus scope then saw the page's body
// as the opener and gave focus back to the body on close (CR-32).
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))

let land: () => void = () => {}
const landed = new Promise<void>((resolve) => (land = resolve))
vi.mock("@/components/ui/responsive-sheet", async (actual) => {
  await landed
  return actual()
})

const { ResponsiveDialog } = await import("./responsive-dialog")

function Page() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Invite</button>
      {open ? (
        <ResponsiveDialog title="Invite people" footer={<button type="button">Send</button>} onClose={() => setOpen(false)}>
          <p>Who works with you?</p>
        </ResponsiveDialog>
      ) : null}
    </>
  )
}

afterEach(cleanup)

describe("focus around a phone sheet that is still loading", () => {
  // First: the chunk is held back until the next case lets it land.
  it("keeps Tab on the frame, and Escape gives focus back to the opener", () => {
    render(<Page />)
    const invite = screen.getByRole("button", { name: "Invite" })
    invite.focus()
    fireEvent.click(invite)
    const frame = screen.getByRole("dialog", { name: "Invite people" })
    expect(document.activeElement).toBe(frame)
    expect(fireEvent.keyDown(frame, { key: "Tab" })).toBe(false)
    fireEvent.keyDown(frame, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(invite)
  })

  it("gives focus back to the opener when the sheet that replaced the frame closes", async () => {
    render(<Page />)
    const invite = screen.getByRole("button", { name: "Invite" })
    invite.focus()
    fireEvent.click(invite)
    await act(async () => {
      land()
      await landed
      await new Promise((r) => setTimeout(r, 0))
    })
    await screen.findByText("Who works with you?")
    // It takes the frame's place, which rose already: it doesn't rise again (app/phone.css C5f).
    expect(screen.getByText("Who works with you?").closest("[data-v3-sheet]")?.classList.contains("sheet-after-frame")).toBe(true)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.queryByText("Who works with you?")).toBeNull()
    expect(document.activeElement).toBe(invite)
  })

  it("rises as ever when its chunk is in already, with no frame before it", async () => {
    render(<Page />)
    fireEvent.click(screen.getByRole("button", { name: "Invite" }))
    const text = await screen.findByText("Who works with you?")
    expect(document.querySelector("[data-sheet-frame]")).toBeNull()
    expect(text.closest("[data-v3-sheet]")?.classList.contains("sheet-after-frame")).toBe(false)
  })
})
