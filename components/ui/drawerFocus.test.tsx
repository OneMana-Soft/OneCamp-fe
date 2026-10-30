import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "./drawer"
import { watchInputModality } from "@/lib/ui/inputModality"

// A sheet opened from the keys took none of them: vaul leaves the focus where
// it was unless autoFocus is set, so at a phone's width a keyboard (a narrow
// window's, a tablet's) stayed on the page behind the sheet, which hides that
// page from a screen reader (27 Oct 2026). The sheet takes the focus itself,
// never its first field (on a phone a tap would throw up the keyboard), and a
// key that closes it gives the focus back to what opened it.

function Sheet({ children, onCloseAutoFocus }: { children?: React.ReactNode; onCloseAutoFocus?: (event: Event) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Options
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus} header={<DrawerTitle>Options</DrawerTitle>}>
          {children ?? <DrawerClose>Done</DrawerClose>}
        </DrawerContent>
      </Drawer>
    </>
  )
}

const opener = () => screen.getByRole("button", { name: "Options" })
const sheet = () => screen.findByRole("dialog", { name: "Options" })

/** Opens it as a keyboard does: Enter on the focused button. */
function openWithKeys() {
  watchInputModality()
  opener().focus()
  fireEvent.keyDown(opener(), { key: "Enter" })
  fireEvent.click(opener())
}

// Radix gives the focus back a task after the sheet goes (FocusScope's
// unmount), so a check that nothing moved it waits for that task.
const closeFocusRan = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

afterEach(cleanup)

describe("a sheet opened from the keys", () => {
  it("takes them, on itself", async () => {
    render(<Sheet />)
    openWithKeys()
    const dialog = await sheet()
    await waitFor(() => expect(document.activeElement).toBe(dialog))
  })

  it("never gives them to its first field", async () => {
    render(
      <Sheet>
        <input aria-label="Name" />
      </Sheet>,
    )
    openWithKeys()
    const dialog = await sheet()
    await waitFor(() => expect(document.activeElement).toBe(dialog))
  })

  it("gives them back to what opened it on Escape", async () => {
    render(<Sheet />)
    openWithKeys()
    const dialog = await sheet()
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(opener()))
  })
})

describe("a sheet's caller", () => {
  it("still decides where the focus goes as it closes", async () => {
    const elsewhere = () => screen.getByRole("textbox", { name: "Elsewhere" })
    render(
      <>
        <Sheet
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            elsewhere().focus()
          }}
        />
        <input aria-label="Elsewhere" />
      </>,
    )
    openWithKeys()
    fireEvent.keyDown(await sheet(), { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(elsewhere()))
  })

  it("keeps a field that took the focus as the sheet opened", async () => {
    render(
      <Sheet>
        <input aria-label="Name" autoFocus />
      </Sheet>,
    )
    openWithKeys()
    await sheet()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" })))
  })
})

describe("a sheet a pointer closes", () => {
  it("leaves the focus be", async () => {
    render(<Sheet />)
    openWithKeys()
    const done = await screen.findByRole("button", { name: "Done" })
    // A press reaches the window first, where lib/ui/inputModality hears it.
    // On the sheet itself it would start vaul's drag, which needs a layout
    // (pointer capture, a computed transform) that jsdom doesn't have.
    fireEvent.pointerDown(window)
    fireEvent.click(done)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).toBe(document.body)
  })
})
