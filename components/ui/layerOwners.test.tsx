import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet"
import { Popover, PopoverAnchor, PopoverContent } from "./popover"
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "./alert-dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./drawer"
import * as DialogPrimitive from "@radix-ui/react-dialog"

// Every layer leaves Escape to what answers it in it (data-escape-own): a
// search with text in a dialog clears first, and the next Esc closes the
// dialog. A layer did it only when it said so; a search (SHADCN-AUDIT's SA-2)
// or a rename in any other closed with the first Esc, before it could clear
// (17 Oct). The one Escape (lib/keys/escape, started for every test as the
// root providers start it) leaves the press before the document, where the
// layers hear it, so no layer carries a line of its own for it.

/** A search that clears on Esc, and says it answers Esc while it has text. */
function Search() {
  const [q, setQ] = React.useState("launch")
  return (
    <input
      aria-label="Search"
      value={q}
      data-escape-own={q ? "" : undefined}
      onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && q) setQ("")
      }}
    />
  )
}

type Draw = (onOpenChange: (open: boolean) => void, onEscapeKeyDown?: (e: KeyboardEvent) => void) => React.ReactElement
const layers: Array<[string, Draw]> = [
  ["dialog", (change, own) => (
    <Dialog open onOpenChange={change}>
      <DialogContent onEscapeKeyDown={own}>
        <DialogTitle>Find</DialogTitle>
        <DialogDescription>Find a table.</DialogDescription>
        <Search />
      </DialogContent>
    </Dialog>
  )],
  ["sheet", (change, own) => (
    <Sheet open onOpenChange={change}>
      <SheetContent onEscapeKeyDown={own}>
        <SheetTitle>Find</SheetTitle>
        <SheetDescription>Find a table.</SheetDescription>
        <Search />
      </SheetContent>
    </Sheet>
  )],
  ["popover", (change, own) => (
    <Popover open onOpenChange={change}>
      <PopoverAnchor asChild>
        <button type="button">Find</button>
      </PopoverAnchor>
      <PopoverContent onEscapeKeyDown={own}>
        <Search />
      </PopoverContent>
    </Popover>
  )],
  ["question", (change, own) => (
    <AlertDialog open onOpenChange={change}>
      <AlertDialogContent onEscapeKeyDown={own}>
        <AlertDialogTitle>Find</AlertDialogTitle>
        <AlertDialogDescription>Find a table.</AlertDialogDescription>
        <Search />
      </AlertDialogContent>
    </AlertDialog>
  )],
  ["dialog of Radix's own, drawn by hand", (change, own) => (
    <DialogPrimitive.Root open onOpenChange={change}>
      <DialogPrimitive.Content onEscapeKeyDown={own} aria-describedby={undefined}>
        <DialogPrimitive.Title>Find</DialogPrimitive.Title>
        <Search />
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  )],
  ["phone's sheet", (change, own) => (
    <Drawer open onOpenChange={change}>
      <DrawerContent onEscapeKeyDown={own}>
        <DrawerTitle>Find</DrawerTitle>
        <DrawerDescription>Find a table.</DrawerDescription>
        <Search />
      </DrawerContent>
    </Drawer>
  )],
]

afterEach(cleanup)

describe.each(layers)("a %s", (_name, draw) => {
  it("leaves the first Esc to a search with text, and closes on the next", () => {
    const onOpenChange = vi.fn()
    render(draw(onOpenChange))
    const search = screen.getByLabelText("Search") as HTMLInputElement
    fireEvent.keyDown(search, { key: "Escape" })
    expect(search.value).toBe("")
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(search, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("still hears what its caller asks of Esc", () => {
    const own = vi.fn()
    render(draw(() => {}, own))
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Escape" })
    expect(own).toHaveBeenCalledTimes(1)
  })
})
