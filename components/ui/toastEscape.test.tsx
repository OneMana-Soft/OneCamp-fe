import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

// Esc closes the innermost layer first: a menu, a popover, a dialog or a
// sheet (interaction spec, rule 7). A toast is not one of them. Radix made
// every toast a layer, and a toast that came while a dialog was open (Link
// copied, Saved a version) became the top one: Esc closed the toast and left
// the dialog. A toast now takes Esc only when it has focus, or when nothing
// else is open; and one press does one thing, so with the right panel open the
// panel closes first and the toast on the next press.

let api: typeof import("@/hooks/use-toast")
let Toaster: typeof import("@/components/ui/toaster").Toaster
let panel: typeof import("@/hooks/useEscapeClosesPanel")
let reveal: typeof import("@/hooks/useTouchReveal")
let ui: {
  overlay: typeof import("@/components/ui/overlaySheet")
  dialog: typeof import("@/components/ui/dialog")
  sheet: typeof import("@/components/ui/sheet")
  menu: typeof import("@/components/ui/dropdown-menu")
}

let stopEscape = () => {}

const graph = () =>
  Promise.all([
    import("@/lib/keys/escape"),
    import("@/hooks/use-toast"),
    import("@/components/ui/toaster"),
    import("@/hooks/useEscapeClosesPanel"),
    import("@/hooks/useTouchReveal"),
    import("@/components/ui/overlaySheet"),
    import("@/components/ui/dialog"),
    import("@/components/ui/sheet"),
    import("@/components/ui/dropdown-menu"),
  ])
// Compiled once while the file is collected, which no hook's time limit
// covers: under load the first compile took the first test's setup past it.
await graph()

beforeEach(async () => {
  // One module graph for the toasts and the layers: Radix keeps its layers
  // in one module, and the bug is the toast and the dialog sharing it. The
  // one Escape is started from it too, to hear what registers in it.
  vi.resetModules()
  const [escape, toasts, toaster, panelHook, revealHook, overlay, dialog, sheet, menu] = await graph()
  stopEscape = escape.listenForEscape()
  api = toasts
  Toaster = toaster.Toaster
  panel = panelHook
  reveal = revealHook
  ui = { overlay, dialog, sheet, menu }
})

afterEach(() => {
  cleanup()
  stopEscape()
})

const toastNamed = (title: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(".toast-root")).find((t) => t.textContent?.includes(title)) ?? null
const toastOpen = (title: string) => toastNamed(title)?.getAttribute("data-state") === "open"

/** Esc, pressed where focus is (or on `target`). Everything it closes, it closes inside the press. */
async function escape(target: Element | null = document.activeElement) {
  await act(async () => {
    fireEvent.keyDown(target ?? document.body, { key: "Escape" })
  })
}

function InDialog() {
  const [open, setOpen] = React.useState(true)
  const { Dialog, DialogContent, DialogDescription, DialogTitle } = ui.dialog
  return (
    <>
      <Toaster />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Who can open the doc</DialogDescription>
          <button type="button" onClick={() => api.toast({ title: "Link copied" })}>
            Copy link
          </button>
        </DialogContent>
      </Dialog>
    </>
  )
}

function InSheet() {
  const [open, setOpen] = React.useState(true)
  const { Sheet, SheetContent, SheetDescription, SheetTitle } = ui.sheet
  return (
    <>
      <Toaster />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle>Channel details</SheetTitle>
          <SheetDescription>Members and settings</SheetDescription>
          <button type="button">Leave</button>
        </SheetContent>
      </Sheet>
    </>
  )
}

function InMenu() {
  const [open, setOpen] = React.useState(true)
  const { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } = ui.menu
  return (
    <>
      <Toaster />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger>More</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** The right panel as rightPanel.tsx wires it, with a field and a button that copies a link. */
function WithPanel() {
  const [open, setOpen] = React.useState(true)
  panel.useEscapeClosesPanel(open, () => setOpen(false))
  return (
    <>
      <Toaster />
      {open && (
        <aside aria-label="Task">
          <input aria-label="Task name" defaultValue="Launch plan" />
          <button type="button" onClick={() => api.toast({ title: "Link copied" })}>
            Copy task link
          </button>
        </aside>
      )}
    </>
  )
}

/** The right panel over a narrow page (LayoutContent): in a sheet that leaves Escape to the panel. */
function NarrowPanel() {
  const [open, setOpen] = React.useState(true)
  panel.useEscapeClosesPanel(open, () => setOpen(false))
  const { OverlaySheet } = ui.overlay
  return (
    <>
      <Toaster />
      {open && (
        <OverlaySheet open onClose={() => setOpen(false)} label="Side panel" escape="own">
          <button type="button" onClick={() => api.toast({ title: "Link copied" })}>
            Copy task link
          </button>
        </OverlaySheet>
      )}
    </>
  )
}

/** A row whose tools a tap shows (useTouchReveal), beside the toasts. */
function TappedRow() {
  const t = reveal.useTouchReveal()
  return (
    <>
      <Toaster />
      <button type="button" {...t.toggleProps}>
        Actions
      </button>
      {t.revealed && <div role="toolbar">Reply</div>}
    </>
  )
}

describe("Esc with a toast showing", () => {
  it("closes the dialog a toast came up in, and leaves the toast", async () => {
    render(<InDialog />)
    const copy = screen.getByRole("button", { name: "Copy link" })
    fireEvent.click(copy)
    expect(toastOpen("Link copied")).toBe(true)
    copy.focus()
    await escape()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(toastOpen("Link copied")).toBe(true)
    // Nothing else is open now: the next Esc is the toast's.
    await escape(document.body)
    expect(toastOpen("Link copied")).toBe(false)
  })

  it("closes a sheet before a toast that came while it was open", async () => {
    render(<InSheet />)
    act(() => {
      api.toast({ title: "Moved to Done" })
    })
    screen.getByRole("button", { name: "Leave" }).focus()
    await escape()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(toastOpen("Moved to Done")).toBe(true)
  })

  it("closes a menu before a toast that came while it was open", async () => {
    render(<InMenu />)
    act(() => {
      api.toast({ title: "Saved a version" })
    })
    await escape(screen.getByRole("menuitem", { name: "Rename" }))
    expect(screen.queryByRole("menu")).toBeNull()
    expect(toastOpen("Saved a version")).toBe(true)
  })

  it("closes the toast that has focus", async () => {
    render(<Toaster />)
    act(() => {
      api.toast({ title: "Link copied" })
    })
    const toast = toastNamed("Link copied")!
    toast.focus()
    await escape(toast)
    expect(toastOpen("Link copied")).toBe(false)
  })

  it("closes the front toast, and only that one, when nothing else is open", async () => {
    render(
      <>
        <Toaster />
        <button type="button">Board</button>
      </>,
    )
    act(() => {
      api.toast({ title: "Moved to Done" })
      api.toast({ title: "Link copied" })
    })
    screen.getByRole("button", { name: "Board" }).focus()
    await escape()
    expect(toastOpen("Link copied")).toBe(false)
    expect(toastOpen("Moved to Done")).toBe(true)
  })

  it("closes the right panel first, then the toast: one press, one thing", async () => {
    render(<WithPanel />)
    const name = screen.getByRole("textbox", { name: "Task name" })
    fireEvent.click(screen.getByRole("button", { name: "Copy task link" }))
    expect(toastOpen("Link copied")).toBe(true)
    name.focus()
    // In a field, the first press leaves the field,
    await escape()
    expect(document.activeElement).not.toBe(name)
    expect(screen.queryByRole("complementary", { name: "Task" })).not.toBeNull()
    expect(toastOpen("Link copied")).toBe(true)
    // the next closes the panel,
    await escape(document.body)
    expect(screen.queryByRole("complementary", { name: "Task" })).toBeNull()
    expect(toastOpen("Link copied")).toBe(true)
    // and the one after that, the toast.
    await escape(document.body)
    expect(toastOpen("Link copied")).toBe(false)
  })

  // Every page-level Escape goes through lib/keys/escape now: a row's tools
  // shown by a tap went away on the same press as the toast.
  it("puts a row's tools away first, then the toast", async () => {
    render(<TappedRow />)
    fireEvent.click(screen.getByRole("button", { name: "Actions" }))
    expect(screen.getByRole("toolbar")).toBeTruthy()
    act(() => {
      api.toast({ title: "Link copied" })
    })
    await escape(document.body)
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(toastOpen("Link copied")).toBe(true)
    await escape(document.body)
    expect(toastOpen("Link copied")).toBe(false)
  })

  it("closes the right panel over a narrow page first, then the toast", async () => {
    render(<NarrowPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Copy task link" }))
    expect(toastOpen("Link copied")).toBe(true)
    await escape()
    expect(screen.queryByRole("dialog", { name: "Side panel" })).toBeNull()
    expect(toastOpen("Link copied")).toBe(true)
    await escape(document.body)
    expect(toastOpen("Link copied")).toBe(false)
  })
})
