import * as React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import { SHEET_QUERY } from "@/components/ui/overlayMode"
import { OverlayBody, OverlayFooter } from "@/components/ui/overlay"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// On a phone every floating overlay is a bottom sheet (the owner, 18 Oct: "in
// case of mobile can we make all popover/dialog a drawer"), decided once
// (components/ui/overlayMode) and drawn once (app/overlay.css).

afterEach(async () => {
  cleanup()
  await new Promise((r) => setTimeout(r, 10))
})

describe("every floating overlay", () => {
  it("is marked for the one layout, the same on every screen: CSS makes it a sheet on a phone", () => {
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent data-testid="popover">A popover</PopoverContent>
      </Popover>,
    )
    expect(screen.getByTestId("popover").getAttribute("data-overlay")).toBe("float")
    cleanup()
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent data-testid="menu">
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    expect(screen.getByTestId("menu").getAttribute("data-overlay")).toBe("float")
    expect(screen.getByTestId("menu").hasAttribute("data-overlay-menu")).toBe(true)
  })

  // A dialog is a root of its own kind, so the one layout holds its body (app/overlay.css 1) and no floating rule
  // takes it over on a phone; a confirm holds no body.
  it("but a dialog and a confirm, which are sheets of their own on a phone (data-v3-sheet), never float", () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined} data-testid="dialog">
          <DialogTitle>A dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByTestId("dialog").getAttribute("data-overlay")).toBe("dialog")
    cleanup()
    render(
      <AlertDialog open>
        <AlertDialogContent aria-describedby={undefined} data-testid="confirm">
          <AlertDialogTitle>A confirm</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    )
    expect(screen.getByTestId("confirm").hasAttribute("data-overlay")).toBe(false)
  })
})
describe("a popover, a menu and a select mark their positioner and the page while they are up", () => {
  const marked = () => document.documentElement.hasAttribute("data-float")
  const wrapperOf = (id: string) => screen.getByTestId(id).parentElement!

  it("for the sheet's rules, found by a mark, not a :has() tried on every element", async () => {
    const menu = (open: boolean) => (
      <DropdownMenu open={open}>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent data-testid="menu">
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    const { rerender } = render(menu(true))
    expect(wrapperOf("menu").hasAttribute("data-radix-popper-content-wrapper")).toBe(true)
    expect(wrapperOf("menu").hasAttribute("data-overlay-wrapper")).toBe(true)
    expect(marked()).toBe(true)
    rerender(menu(false))
    await waitFor(() => expect(screen.queryByTestId("menu")).toBeNull())
    expect(marked(), "the page's mark goes with the last float").toBe(false)
    cleanup()
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent data-testid="popover">A popover</PopoverContent>
      </Popover>,
    )
    expect(wrapperOf("popover").hasAttribute("data-overlay-wrapper")).toBe(true)
    expect(marked()).toBe(true)
  })

  it("and a floating root says when it holds a footer, which is its foot on a phone (app/overlay.css 8b)", () => {
    const popover = (footer: boolean) => (
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent data-testid="popover">
          <div>
            <OverlayBody>A popover</OverlayBody>
            {footer ? <OverlayFooter>Save</OverlayFooter> : null}
          </div>
        </PopoverContent>
      </Popover>
    )
    const { rerender } = render(popover(true))
    expect(screen.getByTestId("popover").hasAttribute("data-overlay-holds-footer"), "marked by its footer, a box down").toBe(true)
    rerender(popover(false))
    expect(screen.getByTestId("popover").hasAttribute("data-overlay-holds-footer"), "the mark goes with the footer").toBe(false)
  })

  it("but a dialog, which has its own dim and no positioner", () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined} data-testid="dialog">
          <DialogTitle>A dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    expect(marked()).toBe(false)
  })

  it("and keeps the ref a caller passes", () => {
    const ref = React.createRef<HTMLDivElement>()
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent ref={ref} data-testid="popover">A popover</PopoverContent>
      </Popover>,
    )
    expect(ref.current).toBe(screen.getByTestId("popover"))
  })
})

// A transform at rest makes a dialog the containing block of a fixed box in it, so an unportalled picker inside
// is confined (e2e/overlayRest). A phone's sheet has translate: none (app/phone.css C5d); a computer's dialog too.
describe("a dialog on a computer", () => {
  it("centres itself with inset 0 and margin auto, holding no transform at rest", () => {
    for (const file of ["components/ui/dialog.tsx", "components/ui/alert-dialog.tsx"]) {
      const src = readFileSync(join(__dirname, "../..", file), "utf8")
      expect(src, file).toMatch(/fixed inset-0 m-auto h-fit/)
      expect(src, file).not.toMatch(/translate-[xy]-\[-50%\]/)
    }
  })
})

describe("the sheet's rules (app/overlay.css)", () => {
  const css = readFileSync(join(__dirname, "../../app/overlay.css"), "utf8")
  it("make every floating overlay a bottom sheet under the one phone rule: at the foot, dimming the page, on the keyboard", () => {
    const at = css.indexOf(`@media ${SHEET_QUERY} {`)
    expect(at, "the sheet look sits under SHEET_QUERY itself").toBeGreaterThan(-1)
    const block = css.slice(at)
    expect(block).toMatch(/\[data-radix-popper-content-wrapper\]\[data-overlay-wrapper\] \{\s*position: fixed !important;\s*inset: auto 0 0 0 !important;\s*transform: none !important;/)
    expect(block).toMatch(/\[data-overlay="float"\] \{\s*position: fixed;\s*inset: auto 0 0 0;\s*translate: none;/)
    expect(block).toMatch(/html\[data-float\] body::after \{\s*content: "";\s*position: fixed;\s*inset: 0;/)
    expect(block).toMatch(/html\[data-keyboard="open"\] \[data-overlay="float"\] \{\s*bottom: calc/)
    expect(block).toMatch(/min-height: 48px;/)
    // In a popper's wrapper the wrapper stands at the foot, with the sheet's size.
    expect(block).toMatch(/\[data-radix-popper-content-wrapper\] > \[data-overlay="float"\] \{\s*position: relative;\s*inset: auto;/)
  })

  it("give every phone sheet's footer ONE foot: its gutter, never under 16px, or the strip, with nothing under it (V-73)", () => {
    const at = css.indexOf(`@media ${SHEET_QUERY} {`)
    const block = css.slice(at, css.indexOf("\n}", at))
    // A drawer's, a float sheet's, a dialog's (its DialogFooter, or a footer of
    // its own marked as the sheet's: a share dialog's) and a confirm's footer, in one rule.
    expect(block).toContain(
      [
        `  [data-overlay="sheet"] > [data-sheet-footer],`,
        `  [data-overlay="float"] [data-overlay-footer],`,
        `  .v3-dialog[role="dialog"][data-v3-sheet] > .v3-dlg-footer,`,
        `  .v3-dialog[role="dialog"][data-v3-sheet] > form > .v3-dlg-footer,`,
        `  .v3-dialog[role="dialog"][data-v3-sheet] > [data-sheet-footer],`,
        `  .v3-confirm-sheet [data-sheet-footer] {`,
        `    padding-bottom: max(16px, var(--sheet-gutter, var(--dlg-pad, 16px)), var(--sheet-strip, env(safe-area-inset-bottom)));`,
        `  }`,
      ].join("\n")
    )
    // On the keyboard there is no strip to keep; the gutter alone stands.
    expect(block).toMatch(/html\[data-keyboard="open"\] \{\s*--sheet-strip: 0px;\s*\}/)
    // The sheet adds nothing under its footer: the footer is its foot. A root that holds one says so, never found by :has().
    expect(block).toMatch(/\[data-overlay="sheet"\]\[data-overlay-holds-footer\],\s*\[data-overlay="float"\]\[data-overlay-holds-footer\] \{\s*padding-bottom: 0;\s*\}/)
    // No other rule gives a sheet's footer a foot of its own.
    const phone = readFileSync(join(__dirname, "../../app/phone.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    const own = [...phone.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter(([, sel, body]) => /v3-dlg-footer|data-sheet-footer|v3-alert-footer/.test(sel) && /padding-bottom/.test(body))
    expect(own.map(([, sel]) => sel.trim())).toEqual([])
  })
})
