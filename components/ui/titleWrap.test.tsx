import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "./alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./drawer"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet"

afterEach(() => {
  cleanup()
  document.querySelectorAll("[data-vaul-drawer-wrapper]").forEach((n) => n.remove())
  document.body.removeAttribute("style")
})

const tokens = (el: Element) => el.className.split(/\s+/)

// A title is balanced by the wrap's style alone. text-balance is text-wrap's
// shorthand, and its mode undid a caller's truncate, so a title cut short ran
// onto a second line (the recording player's name, DESIGN-BUILD-9, 23 Oct
// 2026; Admin › Marketplace's sheet and a doc row's drawer the same).
describe("a title its caller cuts short", () => {
  const surfaces: Record<string, () => React.ReactElement> = {
    dialog: () => (
      <Dialog open>
        <DialogContent>
          <DialogTitle className="truncate">Recording 2026-10-23 19.13.mp4</DialogTitle>
          <DialogDescription>A recording</DialogDescription>
        </DialogContent>
      </Dialog>
    ),
    confirm: () => (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle className="truncate">Recording 2026-10-23 19.13.mp4</AlertDialogTitle>
          <AlertDialogDescription>A recording</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>
    ),
    sheet: () => (
      <Sheet open>
        <SheetContent>
          <SheetTitle className="truncate">Recording 2026-10-23 19.13.mp4</SheetTitle>
          <SheetDescription>A recording</SheetDescription>
        </SheetContent>
      </Sheet>
    ),
    drawer: () => (
      <Drawer open onOpenChange={() => {}}>
        <DrawerContent>
          <DrawerTitle className="truncate">Recording 2026-10-23 19.13.mp4</DrawerTitle>
          <DrawerDescription>A recording</DrawerDescription>
        </DrawerContent>
      </Drawer>
    ),
  }
  for (const [surface, draw] of Object.entries(surfaces)) {
    it(`keeps to its one line in a ${surface}`, () => {
      render(draw())
      const title = tokens(screen.getByText("Recording 2026-10-23 19.13.mp4"))
      expect(title).toContain("truncate")
      expect(title).not.toContain("text-balance")
    })
  }
})

// "Nobody can bring back what goes." left "goes." alone on its last line at
// 390 (DESIGN-BUILD-9's SF2): a confirm's description wraps pretty, as a
// dialog's and a sheet's do.
describe("a confirm's description", () => {
  it("wraps pretty, never leaving one word alone", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this doc for good?</AlertDialogTitle>
          <AlertDialogDescription>Nobody can bring back what goes.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    )
    expect(tokens(screen.getByText("Nobody can bring back what goes."))).toContain("text-pretty")
  })
})
