import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"

// Esc closes the innermost layer first, one layer a press (interaction spec,
// rule 7). A side menu is a layer of its own: Radix closed the whole menu from
// it, side menu and menu in one press, so a second press closed what held the
// menu. In the share dialog that was the dialog itself: Access ends, Esc, Esc,
// and the dialog was gone, unless the second press landed while the menu was
// still fading out (sideMenusMore e2e, 22 Oct 2026). Now Esc in a side menu
// closes it alone and gives its row the focus back, as ← does
// (patches/@radix-ui__react-menu@2.1.16.patch: every Radix menu's side menus,
// at no cost to any page's source). This test keeps the patch through upgrades.

let stopEscape = () => {}
let ui: {
  dialog: typeof import("@/components/ui/dialog")
  menu: typeof import("@/components/ui/dropdown-menu")
}

const graph = () => Promise.all([import("@/lib/keys/escape"), import("@/components/ui/dialog"), import("@/components/ui/dropdown-menu")])
// Compiled once while the file is collected, which no hook's time limit covers.
await graph()

beforeEach(async () => {
  // One module graph for the dialog and the menus: Radix keeps its layers and
  // focus scopes in module state, and the bug is the two sharing it.
  vi.resetModules()
  const [escape, dialog, menu] = await graph()
  stopEscape = escape.listenForEscape()
  ui = { dialog, menu }
})

afterEach(() => {
  cleanup()
  stopEscape()
})

/** A key, pressed where focus is. Everything it opens or closes, it does inside the press. */
async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key })
  })
}

/** The share dialog's level menu, as components/dialog/shareParts.tsx draws it: levels, then Access ends. */
function LevelMenuInDialog() {
  const [dialogOpen, setDialogOpen] = React.useState(true)
  const [menuOpen, setMenuOpen] = React.useState(true)
  const { Dialog, DialogContent, DialogDescription, DialogTitle } = ui.dialog
  const { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } = ui.menu
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent>
        <DialogTitle>Share “Launch notes”</DialogTitle>
        <DialogDescription>People you add get an email and a link.</DialogDescription>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger>priya: Can edit</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Full access</DropdownMenuItem>
            <DropdownMenuItem>Can edit</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Access ends</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>For good</DropdownMenuItem>
                <DropdownMenuItem>In 7 days</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </DialogContent>
    </Dialog>
  )
}

const row = () => screen.getByRole("menuitem", { name: "Access ends" })
const sideMenuOpen = () => screen.queryByRole("menuitem", { name: "In 7 days" }) !== null
const menuOpen = () => screen.queryByRole("menuitem", { name: "Full access" }) !== null
// hidden: an open modal menu hides everything else from assistive tech, the dialog included.
const dialogOpen = () => screen.queryByRole("dialog", { hidden: true }) !== null

async function openSideMenuByKeys() {
  render(<LevelMenuInDialog />)
  await act(async () => row().focus())
  await press("ArrowRight")
  expect(sideMenuOpen(), "→ opens Access ends").toBe(true)
  expect(document.activeElement, "the side menu's first row has the focus").toBe(screen.getByRole("menuitem", { name: "For good" }))
}

describe("Esc in a side menu inside a dialog", () => {
  it("closes the side menu alone, and its row has the focus again", async () => {
    await openSideMenuByKeys()
    await press("Escape")
    expect(sideMenuOpen(), "the side menu is closed").toBe(false)
    expect(menuOpen(), "the menu it came from is still open").toBe(true)
    expect(document.activeElement, "focus is back on Access ends").toBe(row())
    expect(dialogOpen()).toBe(true)
  })

  it("closes the menu on the next press, and the dialog on the one after", async () => {
    await openSideMenuByKeys()
    await press("Escape")
    await press("Escape")
    expect(menuOpen(), "the second press closes the menu").toBe(false)
    expect(dialogOpen(), "and leaves the dialog open").toBe(true)
    await press("Escape")
    expect(dialogOpen(), "the third closes the dialog").toBe(false)
  })

  it("is the same as ←, which closes the side menu alone", async () => {
    await openSideMenuByKeys()
    await press("ArrowLeft")
    expect(sideMenuOpen()).toBe(false)
    expect(menuOpen()).toBe(true)
    expect(document.activeElement).toBe(row())
  })
})
