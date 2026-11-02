import * as React from "react"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "./alert-dialog"
import { Dialog, DialogContent, DialogTitle } from "./dialog"
import { Drawer, DrawerContent, DrawerTitle } from "./drawer"
import { OverlaySheet } from "./overlaySheet"
import { SheetFrame } from "./sheetFrame"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

// EVERY SHEET'S EDGE (miro-40 H1, CR-184's F1). React carries an event up the
// tree a portal came from, not the page's, so a tap on a sheet reached what had
// opened it, behind it: in comment mode, a tap on a board comment's reply box
// reached the board's overlay, which placed a new comment there, a second sheet
// over the thread. Every sheet primitive ends React's walk at its edge, its
// surface's and its scrim's, and leaves the browser's event to go on: the
// document still hears the tap, where Radix closes a menu open on the sheet at
// a finger's tap outside it. The drawer's scrim, which closes its sheet itself,
// stops the browser's event too (components/ui/drawerScrim.test.tsx).

vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))

installPointerEvent()
afterEach(cleanup)

type Sheet = (inner: React.ReactNode, onClick: React.MouseEventHandler) => React.ReactElement

const PRIMITIVES: { name: string; file: string; scrim: string; scrimStopsTheBrowser?: true; ownClick?: true; sheet: Sheet }[] = [
  {
    name: "a drawer",
    file: "drawer.tsx",
    scrim: "[data-v3-scrim]",
    scrimStopsTheBrowser: true,
    ownClick: true,
    sheet: (inner, onClick) => (
      <Drawer open onOpenChange={() => {}}>
        <DrawerContent aria-describedby={undefined} onClick={onClick} header={<DrawerTitle>Thread</DrawerTitle>}>
          {inner}
        </DrawerContent>
      </Drawer>
    ),
  },
  {
    name: "a dialog drawn as a sheet",
    file: "dialog.tsx",
    scrim: "[data-v3-scrim]",
    ownClick: true,
    sheet: (inner, onClick) => (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent aria-describedby={undefined} onClick={onClick}>
          <DialogTitle>Thread</DialogTitle>
          {inner}
        </DialogContent>
      </Dialog>
    ),
  },
  {
    name: "a confirm drawn as a sheet",
    file: "alert-dialog.tsx",
    scrim: "[data-v3-scrim]",
    ownClick: true,
    sheet: (inner, onClick) => (
      <AlertDialog open onOpenChange={() => {}}>
        <AlertDialogContent aria-describedby={undefined} onClick={onClick}>
          <AlertDialogTitle>Thread</AlertDialogTitle>
          {inner}
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
  {
    name: "the task's sheet (OverlaySheet)",
    file: "overlaySheet.tsx",
    scrim: ".shell-scrim",
    sheet: (inner) => (
      <OverlaySheet open onClose={() => {}} label="Thread">
        {inner}
      </OverlaySheet>
    ),
  },
  {
    name: "a sheet's frame while what it holds loads",
    file: "sheetFrame.tsx",
    scrim: "[data-sheet-frame-scrim]",
    sheet: () => <SheetFrame title="Thread" onClose={() => {}} />,
  },
]

/** The sheet, opened from inside something that acts on a click (a board's overlay in comment mode, a tree row). */
function openFrom(sheet: Sheet) {
  const behind = vi.fn()
  const own = vi.fn()
  const mine = vi.fn()
  const heard = vi.fn()
  document.addEventListener("click", heard)
  render(
    <div data-testid="behind" onClick={behind}>
      {sheet(
        <button type="button" onClick={own}>
          Reply
        </button>,
        mine,
      )}
    </div>,
  )
  return { behind, own, mine, heard, done: () => document.removeEventListener("click", heard) }
}

describe("a sheet's edge", () => {
  for (const p of PRIMITIVES) {
    describe(p.name, () => {
      it("a tap on what it holds is the sheet's: it never reaches what the sheet was opened from, and the document still hears it", async () => {
        const t = openFrom(p.sheet)
        const target = p.file === "sheetFrame.tsx" ? await screen.findByText("Thread") : await screen.findByRole("button", { name: "Reply" })
        fireEvent.click(target)
        t.done()
        if (p.file !== "sheetFrame.tsx") expect(t.own, "the sheet's own button").toHaveBeenCalledTimes(1)
        if (p.ownClick) expect(t.mine, "the caller's own onClick on the sheet").toHaveBeenCalledTimes(1)
        expect(t.behind, "what the sheet was opened from").not.toHaveBeenCalled()
        expect(t.heard, "the document hears the tap").toHaveBeenCalledTimes(1)
      })

      it("a tap on its scrim never reaches what the sheet was opened from", async () => {
        const t = openFrom(p.sheet)
        await screen.findAllByText("Thread")
        const scrim = document.querySelector<HTMLElement>(p.scrim)
        expect(scrim, `${p.name}'s scrim`).not.toBeNull()
        fireEvent.click(scrim!)
        t.done()
        expect(t.behind, "what the sheet was opened from").not.toHaveBeenCalled()
        if (!p.scrimStopsTheBrowser) expect(t.heard, "the document hears the tap").toHaveBeenCalledTimes(1)
      })
    })
  }

  it("is every sheet primitive's: each one that draws a sheet ends React's walk at it (sheetEdge)", () => {
    const dir = "components/ui"
    const sheets = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
      .filter((f) => /data-v3-sheet=|data-overlay="sheet"/.test(readFileSync(join(dir, f), "utf8")))
      .sort()
    expect(sheets, "a new sheet primitive joins PRIMITIVES above").toEqual(PRIMITIVES.map((p) => p.file).sort())
    for (const f of sheets) expect(readFileSync(join(dir, f), "utf8"), f).toMatch(/\bsheetEdge\(/)
  })
})
