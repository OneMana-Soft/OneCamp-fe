import * as React from "react"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "./alert-dialog"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet"
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "./drawer"
import { OverlaySheet } from "./overlaySheet"
import { watchInputModality } from "@/lib/ui/inputModality"

// V-829: a dialog opened without a Radix Trigger gave the focus to <body> as it
// closed. Radix gives it back to the Trigger, and ~70 dialogs open by `open=`
// from a button, a menu or a key, with none: Escape left a keyboard at the top
// of the page. Every overlay primitive here now gives it back to what opened
// it, by one rule (components/ui/returnFocus): after a key that closes it, to
// the element the focus came from, if it is still on the page; after a pointer
// or a tap, nowhere (no ring on the opener, no field throwing up a phone's
// keyboard); and a caller's own onCloseAutoFocus first.

type Props = {
  open: boolean
  setOpen: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
  onFocusCapture?: React.FocusEventHandler<HTMLDivElement>
}

/** Each primitive, opened from a button with no Trigger, with the button that closes it. */
const OVERLAYS: { name: string; close: string; takesCaller: boolean; Overlay: (p: Props) => React.ReactElement }[] = [
  {
    name: "the dialog",
    close: "Close",
    takesCaller: true,
    Overlay: ({ open, setOpen, onCloseAutoFocus, onFocusCapture }) => (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onCloseAutoFocus={onCloseAutoFocus} onFocusCapture={onFocusCapture}>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Pick a name.</DialogDescription>
          <input aria-label="Name" />
        </DialogContent>
      </Dialog>
    ),
  },
  {
    name: "the confirm",
    close: "Cancel",
    takesCaller: true,
    Overlay: ({ open, setOpen, onCloseAutoFocus, onFocusCapture }) => (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus} onFocusCapture={onFocusCapture}>
          <AlertDialogTitle>Delete the doc?</AlertDialogTitle>
          <AlertDialogDescription>It goes to the trash.</AlertDialogDescription>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
  {
    name: "the side sheet",
    close: "Close",
    takesCaller: true,
    Overlay: ({ open, setOpen, onCloseAutoFocus, onFocusCapture }) => (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent onCloseAutoFocus={onCloseAutoFocus} onFocusCapture={onFocusCapture}>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list.</SheetDescription>
        </SheetContent>
      </Sheet>
    ),
  },
  {
    name: "the phone's sheet",
    close: "Done",
    takesCaller: true,
    Overlay: ({ open, setOpen, onCloseAutoFocus, onFocusCapture }) => (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus} onFocusCapture={onFocusCapture} header={<DrawerTitle>Options</DrawerTitle>}>
          <DrawerClose>Done</DrawerClose>
        </DrawerContent>
      </Drawer>
    ),
  },
  {
    name: "the sheet over the page",
    close: "Close",
    // The tablet's channel list and the right panel: no caller asks for its own close focus.
    takesCaller: false,
    Overlay: ({ open, setOpen, onFocusCapture }) => (
      <OverlaySheet open={open} onClose={() => setOpen(false)} label="Channel list" onFocusCapture={onFocusCapture}>
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </OverlaySheet>
    ),
  },
]

function Page({
  Overlay,
  opener = true,
  onCloseAutoFocus,
  onFocusCapture,
}: { Overlay: (p: Props) => React.ReactElement; opener?: boolean } & Pick<Props, "onCloseAutoFocus" | "onFocusCapture">) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      {opener && (
        <button type="button" onClick={() => setOpen(true)}>
          Open it
        </button>
      )}
      <input aria-label="Elsewhere" />
      <Overlay open={open} setOpen={setOpen} onCloseAutoFocus={onCloseAutoFocus} onFocusCapture={onFocusCapture} />
    </>
  )
}

const opener = () => screen.getByRole("button", { name: "Open it" })
const elsewhere = () => screen.getByRole("textbox", { name: "Elsewhere" })
/** The overlay that is open, a dialog or the confirm's alertdialog. */
const shownOverlay = () => screen.queryByRole("dialog") ?? screen.queryByRole("alertdialog")
const overlay = () => waitFor(() => shownOverlay() ?? Promise.reject(new Error("no overlay open")))

/** Opens it as a keyboard does: Enter on the focused button. */
async function openWithKeys() {
  watchInputModality()
  opener().focus()
  fireEvent.keyDown(opener(), { key: "Enter" })
  fireEvent.click(opener())
  const shown = await overlay()
  await waitFor(() => expect(shown.contains(document.activeElement)).toBe(true))
  return shown
}

// Radix gives the focus back a task after the overlay goes (FocusScope's
// unmount), so a check that nothing moved it waits for that task.
const closeFocusRan = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

afterEach(cleanup)

describe.each(OVERLAYS)("$name, opened without a trigger", ({ close, Overlay }) => {
  it("gives the focus back to what opened it on Escape", async () => {
    render(<Page Overlay={Overlay} />)
    const box = await openWithKeys()
    fireEvent.keyDown(document.activeElement ?? box, { key: "Escape" })
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener()))
  })

  it("gives the focus back to what opened it on Enter on its close", async () => {
    render(<Page Overlay={Overlay} />)
    await openWithKeys()
    const button = screen.getByRole("button", { name: close })
    button.focus()
    fireEvent.keyDown(button, { key: "Enter" })
    fireEvent.click(button)
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener()))
  })

  it("forces nothing after a pointer or a tap closes it", async () => {
    render(<Page Overlay={Overlay} />)
    await openWithKeys()
    // A press reaches the window first, where lib/ui/inputModality hears it.
    fireEvent.pointerDown(window)
    fireEvent.click(screen.getByRole("button", { name: close }))
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).toBe(document.body)
  })

  it("forces nothing, and throws nothing, when what opened it went while it was open", async () => {
    const { rerender } = render(<Page Overlay={Overlay} />)
    const box = await openWithKeys()
    rerender(<Page Overlay={Overlay} opener={false} />)
    expect(screen.queryByRole("button", { name: "Open it" })).toBeNull()
    fireEvent.keyDown(document.activeElement ?? box, { key: "Escape" })
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).toBe(document.body)
  })
})

describe.each(OVERLAYS.filter((o) => o.takesCaller))("$name, opened without a trigger, with its caller's own close focus", ({ Overlay }) => {
  it("lets its caller's onCloseAutoFocus decide, with preventDefault", async () => {
    render(
      <Page
        Overlay={Overlay}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          elsewhere().focus()
        }}
      />,
    )
    const box = await openWithKeys()
    fireEvent.keyDown(document.activeElement ?? box, { key: "Escape" })
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).toBe(elsewhere())
  })

  it("gives nothing back when its caller's onCloseAutoFocus only prevents the default", async () => {
    render(<Page Overlay={Overlay} onCloseAutoFocus={(event) => event.preventDefault()} />)
    const box = await openWithKeys()
    fireEvent.keyDown(document.activeElement ?? box, { key: "Escape" })
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).not.toBe(opener())
    expect(document.activeElement).toBe(document.body)
  })
})

describe.each(OVERLAYS)("$name, opened without a trigger, with its caller's own onFocusCapture", ({ Overlay }) => {
  it("hands the caller every focus that goes in, and still gives the focus back on Escape", async () => {
    const seen: EventTarget[] = []
    render(<Page Overlay={Overlay} onFocusCapture={(event) => void seen.push(event.target)} />)
    const box = await openWithKeys()
    expect(seen).toContain(document.activeElement)
    expect(seen.every((target) => box.contains(target as Node))).toBe(true)
    fireEvent.keyDown(document.activeElement ?? box, { key: "Escape" })
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener()))
  })
})

describe("a dialog a menu row opened", () => {
  // The row goes with its menu (in a browser it fades out behind the dialog,
  // so it is still there as the focus goes in): the button the menu is named
  // by stands for it, as Radix names a DropdownMenu by its trigger.
  function Menu({ menu }: { menu: boolean }) {
    const [open, setOpen] = React.useState(false)
    return (
      <>
        <button type="button" id="display-button">
          Display
        </button>
        {menu && (
          <div role="menu" aria-labelledby="display-button">
            <button type="button" role="menuitem" onClick={() => setOpen(true)}>
              Manage fields
            </button>
          </div>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Fields</DialogTitle>
            <DialogDescription>A project&apos;s own fields.</DialogDescription>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  it("gives the focus back to the menu's button on Escape", async () => {
    const { rerender } = render(<Menu menu />)
    watchInputModality()
    const row = screen.getByRole("menuitem", { name: "Manage fields" })
    row.focus()
    fireEvent.keyDown(row, { key: "Enter" })
    fireEvent.click(row)
    const dialog = await screen.findByRole("dialog", { name: "Fields" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    rerender(<Menu menu={false} />)
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Display" })))
  })
})

describe("a dialog whose opener went as it opened", () => {
  // No fade: the menu or popover goes in the render that opens the dialog, so
  // the row is off the page before the focus goes in and nothing names it as
  // where the focus came from. The opener is read as the dialog opens, from
  // where the key or press that opened it was: the row, standing for the
  // button of the menu or popover it went with.
  // "fades": the popover stays to fade, its rows gone at once (the calendar's
  // Calendars panel empties as it closes), so the row, off the page alone,
  // no longer finds the popover it was in.
  function Opened({ box }: { box: "menu" | "popover" | "stays" | "fades" }) {
    const [open, setOpen] = React.useState(false)
    const [shown, setShown] = React.useState(true)
    const row = (
      <button
        type="button"
        role={box === "menu" ? "menuitem" : undefined}
        onClick={() => {
          setOpen(true)
          if (box !== "stays") setShown(false)
        }}
      >
        Subscribe
      </button>
    )
    return (
      <>
        <button type="button" id="calendars-button" aria-haspopup={box === "menu" ? "menu" : "dialog"} aria-controls={box === "menu" ? undefined : "calendars-panel"}>
          Calendars
        </button>
        {shown && box === "menu" && (
          <div role="menu" aria-labelledby="calendars-button">
            {row}
          </div>
        )}
        {shown && box !== "menu" && box !== "fades" && (
          <div role="dialog" id="calendars-panel" aria-label="Your calendars" data-state="open">
            {row}
          </div>
        )}
        {box === "fades" && (
          <div role="dialog" id="calendars-panel" aria-label="Your calendars" data-state={shown ? "open" : "closed"}>
            {shown ? <div>{row}</div> : null}
          </div>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Add a calendar</DialogTitle>
            <DialogDescription>Its address.</DialogDescription>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  async function openAndEscape() {
    watchInputModality()
    const row = screen.getByRole(screen.queryByRole("menuitem") ? "menuitem" : "button", { name: "Subscribe" })
    row.focus()
    fireEvent.keyDown(row, { key: "Enter" })
    fireEvent.click(row)
    const dialog = await screen.findByRole("dialog", { name: "Add a calendar" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a calendar" })).toBeNull())
    await closeFocusRan()
  }

  it("gives the focus back to the menu's button when the menu went at once", async () => {
    render(<Opened box="menu" />)
    await openAndEscape()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Calendars" })))
  })

  it("gives it back to the popover's button when the popover went at once", async () => {
    render(<Opened box="popover" />)
    await openAndEscape()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Calendars" })))
  })

  it("gives it back to the popover's button when the popover's rows went before it", async () => {
    render(<Opened box="fades" />)
    await openAndEscape()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Calendars" })))
  })

  it("gives it back to the row itself when its popover stays open", async () => {
    render(<Opened box="stays" />)
    await openAndEscape()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Subscribe" }))
  })
})

describe("a dialog that closes as the next opens", () => {
  // Rename's Next, by Enter, closes it and opens Share, whose field takes the
  // focus: Rename's close gives nothing back over it.
  function Steps() {
    const [step, setStep] = React.useState<"none" | "rename" | "share">("none")
    return (
      <>
        <button type="button" onClick={() => setStep("rename")}>
          Open it
        </button>
        <Dialog open={step === "rename"} onOpenChange={(open) => !open && setStep("none")}>
          <DialogContent>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Pick a name.</DialogDescription>
            <button type="button" onClick={() => setStep("share")}>
              Next
            </button>
          </DialogContent>
        </Dialog>
        <Dialog open={step === "share"} onOpenChange={(open) => !open && setStep("none")}>
          <DialogContent>
            <DialogTitle>Share</DialogTitle>
            <DialogDescription>Who sees it.</DialogDescription>
            <input aria-label="People" autoFocus />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  it("leaves the focus where the next one put it", async () => {
    render(<Steps />)
    await openWithKeys()
    const next = screen.getByRole("button", { name: "Next" })
    next.focus()
    fireEvent.keyDown(next, { key: "Enter" })
    fireEvent.click(next)
    const people = await screen.findByRole("textbox", { name: "People" })
    await waitFor(() => expect(document.activeElement).toBe(people))
    await closeFocusRan()
    expect(document.activeElement).toBe(people)
  })
})

describe("the rule's one home", () => {
  const ui = join(process.cwd(), "components/ui")
  const sources = readdirSync(ui)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => ({ file: f, text: readFileSync(join(ui, f), "utf8") }))
  const overlays = sources.filter(({ text }) => /\b(?:Dialog|AlertDialog|Sheet|Drawer)Primitive\.Content\b/.test(text))

  it("is every overlay primitive's: each one with a Radix or vaul Content takes its close focus from returnFocus", () => {
    expect(overlays.map((s) => s.file).sort()).toEqual(["CommandPalette.tsx", "alert-dialog.tsx", "dialog.tsx", "drawer.tsx", "overlaySheet.tsx", "sheet.tsx"])
    for (const { file, text } of overlays) expect(text, file).toMatch(/useReturnFocus\(|ReturnFocus\b/)
  })

  it("leaves no copy behind: no other primitive remembers an opener to focus as it closes", () => {
    for (const { file, text } of sources) {
      if (file === "returnFocus.ts") continue
      expect(text, file).not.toMatch(/returnTo\.current|opener\.current/)
    }
  })

  it("never reaches the palette's lazy chunk but as a type: the eager loader holds the hook", () => {
    const palette = sources.find((s) => s.file === "CommandPalette.tsx")!.text
    expect(palette).not.toMatch(/^import (?!type)[^\n]*["']@\/components\/ui\/returnFocus["']/m)
    expect(sources.find((s) => s.file === "CommandPaletteLoader.tsx")!.text).toMatch(/useReturnFocus\(/)
  })

  it("reaches every raw Radix Content outside components/ui, lazy ones as props from the eager manager", () => {
    const root = join(process.cwd(), "components")
    const raw = (readdirSync(root, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith("ui/"))
      .map((f) => ({ file: f, text: readFileSync(join(root, f), "utf8") }))
      .filter(({ text }) => /\b(?:Dialog|AlertDialog|Sheet|Drawer)Primitive\.Content\b/.test(text))
    expect(raw.map((s) => s.file).sort()).toEqual(["channel/details/channelDetailsSheet.tsx", "conversation/details/conversationDetailsSheet.tsx"])
    for (const { file, text } of raw) {
      expect(text, file).toMatch(/^import type \{ ReturnFocus \} from "@\/components\/ui\/returnFocus"/m)
      expect(text, file).toMatch(/\{\.\.\.back\}/)
    }
    const manager = sources.find((s) => s.file === "UnifiedUIManager.tsx")!.text
    for (const sheet of ["ChannelDetailsSheet", "ConversationDetailsSheet"]) expect(manager, sheet).toMatch(new RegExp(`<${sheet}\\s+\\{\\.\\.\\.\\w+Back\\}`))
  })
})

describe("a sheet a tap closes, with a key elsewhere before its exit ends", () => {
  // The board's Export at 390: a tap on Export closes its sheet and opens
  // Excalidraw's own dialog, whose Escape comes while the sheet still slides
  // out. The tap closed the sheet, so its close gives nothing back.
  function Export() {
    const [open, setOpen] = React.useState(false)
    const [foreign, setForeign] = React.useState(false)
    return (
      <>
        <style>{"[role=dialog][data-state=closed]{animation-name:out}"}</style>
        <button type="button" onClick={() => setOpen(true)}>
          Open it
        </button>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent aria-describedby={undefined} header={<DrawerTitle>Export this board</DrawerTitle>}>
            <button type="button" onClick={() => (setOpen(false), setForeign(true))}>
              Export
            </button>
          </DrawerContent>
        </Drawer>
        {foreign && <input aria-label="Save as image" onKeyDown={(e) => e.key === "Escape" && setForeign(false)} />}
      </>
    )
  }

  it("forces nothing as the exit ends", async () => {
    render(<Export />)
    const sheet = await openWithKeys()
    const exportIt = screen.getByRole("button", { name: "Export" })
    fireEvent.pointerDown(window)
    fireEvent.click(exportIt)
    // Its exit starts, a frame after the tap.
    act(() => void sheet.dispatchEvent(new Event("animationstart", { bubbles: true })))
    // Off the accessibility tree while the closing sheet is still modal.
    const foreign = document.querySelector<HTMLInputElement>('input[aria-label="Save as image"]')!
    // Excalidraw's dialog takes the focus as it opens.
    act(() => foreign.focus())
    expect(document.activeElement).toBe(foreign)
    fireEvent.keyDown(foreign, { key: "Escape" })
    expect(foreign.isConnected).toBe(false)
    expect(sheet.isConnected, "the sheet still slides out").toBe(true)
    act(() => {
      const end = new Event("animationend", { bubbles: true })
      Object.defineProperty(end, "animationName", { value: "out" })
      sheet.dispatchEvent(end)
    })
    await waitFor(() => expect(sheet.isConnected).toBe(false))
    await closeFocusRan()
    expect(document.activeElement).toBe(document.body)
  })
})

describe("a dialog with a menu or a dialog of its own used inside it", () => {
  // The menu (and a dialog opened from inside) is portalled outside the
  // dialog's own box, so when it closes the focus comes back into the dialog
  // from outside it: that is not what opened the dialog, which keeps its opener.
  function Rename({ inner }: { inner: "menu" | "dialog" }) {
    const [open, setOpen] = React.useState(false)
    const [colour, setColour] = React.useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open it
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Pick a name.</DialogDescription>
            {inner === "menu" ? (
              <DropdownMenu>
                <DropdownMenuTrigger>Colour</DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>Teal</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button type="button" onClick={() => setColour(true)}>
                Colour
              </button>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={colour} onOpenChange={setColour}>
          <DialogContent>
            <DialogTitle>Pick a colour</DialogTitle>
            <DialogDescription>For the doc&apos;s mark.</DialogDescription>
            <input aria-label="Hex" />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  it.each(["menu", "dialog"] as const)("gives the focus back to what opened it once a %s used inside it closed by a key", async (inner) => {
    render(<Rename inner={inner} />)
    const box = await openWithKeys()
    const colour = within(box).getByRole("button", { name: "Colour" })
    colour.focus()
    fireEvent.keyDown(colour, { key: "Enter" })
    if (inner === "dialog") fireEvent.click(colour)
    // The focus is in the menu or the second dialog, outside the first one's box.
    await waitFor(() => expect(!box.contains(document.activeElement) && document.activeElement?.closest(`[role=${inner}]`)).toBeTruthy())
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(colour))
    fireEvent.keyDown(colour, { key: "Escape" })
    await waitFor(() => expect(box.isConnected).toBe(false))
    await waitFor(() => expect(document.activeElement).toBe(opener()))
  })
})

describe("a dialog a click opened, closed by a key", () => {
  // Opened with the mouse, closed with Escape: the keyboard needs to know where
  // it is, so the focus goes back. The open animation starts after the click,
  // and only a closing one (a tap's) forgets the opener.
  const openAnimationStarts = () => act(() => void document.activeElement!.dispatchEvent(new Event("animationstart", { bubbles: true })))

  it("gives the focus back to the button the click opened it from", async () => {
    render(<Page Overlay={OVERLAYS[0].Overlay} />)
    watchInputModality()
    fireEvent.pointerDown(opener())
    // Chrome focuses a button as the press lands on it.
    opener().focus()
    fireEvent.click(opener())
    const box = await overlay()
    await waitFor(() => expect(box.contains(document.activeElement)).toBe(true))
    openAnimationStarts()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener()))
  })

  it("gives the focus back to the menu's button when a clicked row opened it and went with its menu", async () => {
    function Menu() {
      const [open, setOpen] = React.useState(false)
      return (
        <>
          <button type="button" id="display-button">
            Display
          </button>
          {!open && (
            <div role="menu" aria-labelledby="display-button">
              <button type="button" role="menuitem" onClick={() => setOpen(true)}>
                Manage fields
              </button>
            </div>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Fields</DialogTitle>
              <DialogDescription>A project&apos;s own fields.</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    render(<Menu />)
    watchInputModality()
    const row = screen.getByRole("menuitem", { name: "Manage fields" })
    // Radix focuses the row the pointer is on; the press is where it was.
    row.focus()
    fireEvent.pointerDown(row)
    fireEvent.click(row)
    const dialog = await screen.findByRole("dialog", { name: "Fields" })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    openAnimationStarts()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Display" })))
  })
})

describe("a dialog opened from its own trigger", () => {
  it("forces nothing after a pointer closes it, not even its trigger as Radix would", async () => {
    render(
      <Dialog>
        <DialogTrigger>Rename it</DialogTrigger>
        <DialogContent>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Pick a name.</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    watchInputModality()
    const trigger = screen.getByRole("button", { name: "Rename it" })
    fireEvent.pointerDown(trigger)
    trigger.focus()
    fireEvent.click(trigger)
    const box = await overlay()
    fireEvent.pointerDown(window)
    fireEvent.click(within(box).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(shownOverlay()).toBeNull())
    await closeFocusRan()
    expect(document.activeElement).not.toBe(trigger)
    expect(document.activeElement).toBe(document.body)
  })
})

describe("a dialog two buttons open, one after the other", () => {
  // Its hook outlives one open (as the palette's loader's and the shell's
  // manager's do): each close gives the focus back to this open's opener.
  function Two() {
    const [open, setOpen] = React.useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          From the list
        </button>
        <button type="button" onClick={() => setOpen(true)}>
          From the board
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Pick a name.</DialogDescription>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  it("gives the focus back to the second button after the second open", async () => {
    render(<Two />)
    watchInputModality()
    for (const name of ["From the list", "From the board"]) {
      const button = screen.getByRole("button", { name })
      button.focus()
      fireEvent.keyDown(button, { key: "Enter" })
      fireEvent.click(button)
      const box = await overlay()
      await waitFor(() => expect(box.contains(document.activeElement)).toBe(true))
      fireEvent.keyDown(document.activeElement!, { key: "Escape" })
      await waitFor(() => expect(shownOverlay()).toBeNull())
      await waitFor(() => expect(document.activeElement, name).toBe(button))
    }
  })
})

describe("a dialog opened with nothing to say where the focus came from", () => {
  // The focus was in a popover's field, still open, when a press on the page
  // (no button: the focus falls to the page) opened the dialog: the popover
  // held the focus but did not open it, so its close gives nothing back.
  function Card() {
    const [open, setOpen] = React.useState(false)
    return (
      <>
        <button type="button" id="calendars-button" aria-controls="calendars-panel">
          Calendars
        </button>
        <div role="dialog" id="calendars-panel" aria-label="Your calendars" data-state="open" tabIndex={-1}>
          <input aria-label="Find a calendar" />
        </div>
        <div onClick={() => setOpen(true)}>Add a calendar</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Add a calendar</DialogTitle>
            <DialogDescription>Its address.</DialogDescription>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  it("gives nothing back to the popover the focus was in", async () => {
    render(<Card />)
    watchInputModality()
    const find = screen.getByRole("textbox", { name: "Find a calendar" })
    find.focus()
    const card = screen.getByText("Add a calendar")
    fireEvent.pointerDown(card)
    // The press lands on no button, so the focus falls to the page.
    find.blur()
    fireEvent.click(card)
    const box = await screen.findByRole("dialog", { name: "Add a calendar" })
    await waitFor(() => expect(box.contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(box.isConnected).toBe(false))
    await closeFocusRan()
    expect(find.isConnected, "the popover stays open").toBe(true)
    expect(document.activeElement).toBe(document.body)
  })
})
