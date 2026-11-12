import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog"
import { Drawer, DrawerContent, DrawerTitle } from "./drawer"
import { Button } from "./button"
import { Input } from "./input"
import { TellGuestsPrompt } from "@/components/calendar/tellGuestsDialog"
import { SCREENS, putOnScreen, type ScreenName } from "@/lib/testing/screens"

// V-835: an overlay opened by a tap put the focus on its first tabbable: a
// project's Fields on its first row's name, selected (a phone's keyboard came
// up over the sheet, and the next key replaced the name), and Tell guests? on
// Send, ringed. Every overlay's open focus is one rule now, beside its close
// focus (components/ui/returnFocus's openFocus): the caller's choice first; on
// a touch screen, the overlay itself; with a mouse, the dialog's first field.

let undo = () => {}
const on = (name: ScreenName) => void (undo = putOnScreen(SCREENS[name]))

// jsdom lays nothing out: every element has a box, so the first field is seen.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
})
afterEach(() => {
  cleanup()
  undo()
  undo = () => {}
  vi.restoreAllMocks()
})

/** A project's Fields as it opens: its first row's name, then a button. */
function Fields({ onOpenAutoFocus }: { onOpenAutoFocus?: (event: Event) => void }) {
  return (
    <Dialog open>
      <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
        <DialogTitle>Fields</DialogTitle>
        <DialogDescription>What every task in the project carries.</DialogDescription>
        <Input aria-label="Field name" defaultValue="Spend" />
        <Button>Add a field</Button>
      </DialogContent>
    </Dialog>
  )
}

const name = () => screen.getByLabelText<HTMLInputElement>("Field name")

describe("an overlay's open focus (V-835)", () => {
  it("on a touch screen, is the dialog itself: no field focused, nothing selected", () => {
    on("a phone in portrait")
    render(<Fields />)
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Fields" }))
    expect(name().selectionEnd! - name().selectionStart!).toBe(0)
  })

  it("on a tablet too", () => {
    on("a tablet")
    render(<Fields />)
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Fields" }))
  })

  it("with a mouse or a trackpad, is still the first field", () => {
    on("a computer")
    render(<Fields />)
    expect(document.activeElement).toBe(name())
  })

  it("lets a caller's onOpenAutoFocus that prevents the default decide, on a touch screen too", () => {
    on("a phone in portrait")
    const caller = (event: Event) => {
      event.preventDefault()
      ;(event.target as HTMLElement).querySelector("button")?.focus()
    }
    render(<Fields onOpenAutoFocus={caller} />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a field" }))
  })

  // A phone's ring sheet (components/calls/RingCard) puts the focus on Accept
  // this way: the sheet's own rule must hand the caller its say too.
  it.each(["a phone in portrait", "a computer"] as const)(
    "lets a sheet's caller that prevents the default keep its own button, on %s",
    async (screenName) => {
      on(screenName)
      const caller = (event: Event) => {
        event.preventDefault()
        screen.getByRole("button", { name: "Accept" }).focus()
      }
      render(
        <Drawer open>
          <DrawerContent aria-describedby={undefined} onOpenAutoFocus={caller} header={<DrawerTitle>Call</DrawerTitle>}>
            <Button>Accept</Button>
          </DrawerContent>
        </Drawer>,
      )
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Accept" })))
    },
  )

  it("still holds the dialog itself after a caller that only looks", () => {
    on("a phone in portrait")
    const caller = vi.fn()
    render(<Fields onOpenAutoFocus={caller} />)
    expect(caller).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Fields" }))
  })

  it("leaves Radix's default where no pointer is known (no matchMedia)", () => {
    render(<Fields />)
    expect(document.activeElement).toBe(name())
  })

  it("puts Tell guests? on Send with a mouse, and on the question itself on a touch screen", () => {
    on("a computer")
    const { unmount } = render(<TellGuestsPrompt action="change" onDone={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Send" }))
    unmount()
    undo()
    on("a phone in portrait")
    render(<TellGuestsPrompt action="change" onDone={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
  })
})
