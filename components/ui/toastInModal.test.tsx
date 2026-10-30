import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { Toaster } from "@/components/ui/toaster"
import { showUndo } from "@/components/ui/undoToast"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

// V-98: a toast raised from inside an open modal (deleting a field in Fields,
// a form in Forms) was on screen but not in the accessibility tree. A modal
// hides everything outside itself from assistive tech (aria-hidden on the
// rest of the page), the toasts' region included, so its Undo had no role
// and no name. The toasts' region stays reachable; the page behind the modal
// stays hidden.

afterEach(() => cleanup())

type Modal = "dialog" | "alert" | "sheet"

function Page({ modal, onUndo }: { modal: Modal; onUndo: () => void }) {
  const [open, setOpen] = React.useState(true)
  const body = (
    <button type="button" onClick={() => showUndo("Field deleted", onUndo)}>
      Delete field
    </button>
  )
  return (
    <>
      <button type="button">Behind the modal</button>
      <Toaster />
      {modal === "dialog" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Fields</DialogTitle>
            <DialogDescription>The project&apos;s fields</DialogDescription>
            {body}
          </DialogContent>
        </Dialog>
      ) : modal === "alert" ? (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>Delete the field?</AlertDialogTitle>
            <AlertDialogDescription>Its values go with it</AlertDialogDescription>
            {body}
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent>
            <SheetTitle>Forms</SheetTitle>
            <SheetDescription>The project&apos;s forms</SheetDescription>
            {body}
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

describe("a toast raised inside a modal (V-98)", () => {
  for (const modal of ["dialog", "alert", "sheet"] as const) {
    it(`its Undo is reachable by role from a ${modal}, and the page behind stays hidden`, async () => {
      const onUndo = vi.fn()
      render(<Page modal={modal} onUndo={onUndo} />)
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Delete field" }))
      })
      const undo = await screen.findByRole("button", { name: "Undo" })
      // "off" on the list silences nothing: Radix's announcer still speaks the toast, through a status region.
      await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("Field deleted"))).toBe(true))
      expect(screen.getByRole("region", { name: /Notifications/ })).toBeTruthy()
      // The modal still hides the page behind it.
      expect(screen.queryByRole("button", { name: "Behind the modal" })).toBeNull()
      await act(async () => {
        fireEvent.click(undo)
      })
      expect(onUndo).toHaveBeenCalledTimes(1)
      // Undo leaves the modal open.
      expect(screen.getByRole("button", { name: "Delete field" })).toBeTruthy()
    })
  }
})

// V-99: nor could the keyboard. ⌥T took focus to the toasts, and the modal's
// focus trap (Radix's FocusScope) pulled it straight back, so the Undo was the
// mouse's alone. The toasts take a turn on the trap's stack (toastTurn.tsx):
// focus comes in, and Esc there goes back to where it came from, the modal
// staying open. The app's one Escape (lib/keys/escape) runs, as on every page.
function press(target: Element, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))
  })
}
const altT = (target: Element) => press(target, { key: "t", code: "KeyT", altKey: true })
const toasts = () => document.querySelector<HTMLElement>(".toast-viewport")!
// Radix gives the trap back a tick after the scope over it goes.
const trapBack = () => act(() => new Promise((done) => setTimeout(done, 0)))

async function deleteIn(modal: Modal, onUndo: () => void = () => undefined) {
  render(<Page modal={modal} onUndo={onUndo} />)
  const del = screen.getByRole("button", { name: "Delete field" })
  act(() => del.focus())
  await act(async () => {
    fireEvent.click(del)
  })
  const undo = await screen.findByRole("button", { name: "Undo" })
  return { del, undo, list: toasts() }
}

describe("the keyboard reaches a toast raised inside a modal (V-99)", () => {
  // Each leg's toasts go with it.
  afterEach(() => act(() => document.querySelectorAll<HTMLElement>("[toast-close]").forEach((close) => close.click())))

  for (const modal of ["dialog", "alert", "sheet"] as const) {
    it(`⌥T reaches its Undo from ${modal === "alert" ? "an" : "a"} ${modal}, and Esc or the Undo goes back into the ${modal}`, async () => {
      const onUndo = vi.fn()
      const { del, undo, list } = await deleteIn(modal, onUndo)

      altT(del)
      await waitFor(() => expect(document.activeElement, "⌥T takes focus to the toasts").toBe(list))
      press(list, { key: "Escape" })
      expect(document.activeElement, "Esc goes back to where ⌥T came from").toBe(del)
      expect(screen.getByRole("button", { name: "Undo" }), "and leaves the toast").toBeTruthy()
      expect(screen.getByRole("button", { name: "Delete field" }), "and the modal").toBeTruthy()
      await trapBack()

      // Tab is Radix's in the toasts: the front toast, then its Undo.
      altT(del)
      await waitFor(() => expect(document.activeElement).toBe(list))
      press(list, { key: "Tab" })
      press(document.activeElement!, { key: "Tab" })
      expect(document.activeElement, "Tab reaches the Undo").toBe(undo)
      await act(async () => {
        fireEvent.click(undo)
      })
      expect(onUndo).toHaveBeenCalledTimes(1)
      expect(document.activeElement, "the Undo goes back to where ⌥T came from").toBe(del)
      expect(screen.getByRole("button", { name: "Delete field" }), "and the modal stays").toBeTruthy()
    })
  }

  // Radix takes a turn's scope off its stack a timer tick after the turn ends,
  // and a key can come first: on a busy thread Chrome runs pending input ahead
  // of timers (CODE-REVIEWER-99). ⌥T in that tick finds the modal's trap still
  // paused, so the list keeps focus; it takes its turn all the same, or the
  // trap comes back with focus stuck in the toasts and Esc going nowhere.
  for (const modal of ["dialog", "alert", "sheet"] as const) {
    it(`⌥T in the tick after Esc still takes a turn from ${modal === "alert" ? "an" : "a"} ${modal}`, async () => {
      const { del, list } = await deleteIn(modal)
      altT(del)
      await waitFor(() => expect(list.hasAttribute("data-escape-own")).toBe(true))
      // Radix's tick, held.
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
      try {
        press(list, { key: "Escape" })
        expect(document.activeElement).toBe(del)
        altT(del)
        expect(document.activeElement, "the paused trap leaves focus in the toasts").toBe(list)
        await act(async () => {
          for (let i = 0; i < 20 && !list.hasAttribute("data-escape-own"); i++) await Promise.resolve()
        })
        expect(list.hasAttribute("data-escape-own"), "a turn").toBe(true)
      } finally {
        // The tick runs: Radix takes the last turn's scope off and the trap is back.
        act(() => vi.runOnlyPendingTimers())
        vi.useRealTimers()
      }
      expect(document.activeElement, "the trap back, the turn holds focus in the toasts").toBe(list)
      press(list, { key: "Escape" })
      expect(document.activeElement, "Esc goes back to where ⌥T came from").toBe(del)
      expect(screen.getByRole("button", { name: "Delete field" }), "and the modal stays").toBeTruthy()
      await trapBack()
    })
  }

  it("Tab past the last toast, or back past the first, goes back into the modal, not to the page behind", async () => {
    const { del, list } = await deleteIn("dialog")
    altT(del)
    await waitFor(() => expect(document.activeElement).toBe(list))
    for (let i = 0; i < 8 && document.activeElement !== del; i++) press(document.activeElement!, { key: "Tab" })
    expect(document.activeElement, "past the last").toBe(del)
    await trapBack()
    altT(del)
    await waitFor(() => expect(document.activeElement).toBe(list))
    press(list, { key: "Tab", shiftKey: true })
    expect(document.activeElement, "back past the first").toBe(del)
  })

  it("leaves the trap as it was: without ⌥T, focus on a toast or behind the dialog goes back into it", async () => {
    const { del } = await deleteIn("dialog")
    const toast = document.querySelector<HTMLElement>(".toast-root")!
    act(() => toast.focus())
    expect(document.activeElement, "a click's focus on a toast").toBe(del)
    // ⌥T's turn ends behind it.
    altT(del)
    await waitFor(() => expect(document.activeElement).toBe(toasts()))
    press(document.activeElement!, { key: "Escape" })
    await trapBack()
    act(() => toast.focus())
    expect(document.activeElement, "after ⌥T and back").toBe(del)
    act(() => screen.getByText("Behind the modal").focus())
    expect(document.activeElement, "the page behind").toBe(del)
  })

  it("takes no turn from the page: ⌥T focuses the toasts at once, and Esc closes the toast with focus, as before", async () => {
    render(
      <>
        <button type="button" onClick={() => showUndo("Task deleted", () => undefined)}>
          Delete task
        </button>
        <Toaster />
      </>,
    )
    const del = screen.getByRole("button", { name: "Delete task" })
    act(() => del.focus())
    await act(async () => {
      fireEvent.click(del)
    })
    await screen.findByRole("button", { name: "Undo" })
    const list = toasts()
    altT(del)
    expect(document.activeElement).toBe(list)
    expect(list.hasAttribute("data-escape-own"), "no turn").toBe(false)
    press(list, { key: "Tab" })
    const toast = document.activeElement!
    expect(toast.classList.contains("toast-root")).toBe(true)
    press(toast, { key: "Escape" })
    await waitFor(() => expect(toast.isConnected && toast.getAttribute("data-state") === "open", "the toast closes").toBe(false))
  })
})
