import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// A side menu opened by keyboard closed itself under a resting mouse (sideMenusMore.spec's Remind me…). The
// pointer stayed where "More actions" was clicked, the menu grew under it, and opening Remind me… made Chrome
// send the row under the still pointer a trusted pointerout. Radix took it for the mouse leaving, gave its menu
// the focus back, and the side menu closed on losing it. Every row now hears the mouse only when it has moved:
// a pointerout or pointermove where the pointer last moved to is defaultPrevented, which Radix's row handlers
// skip. jsdom runs no layout, so the closing itself is the e2e's (sideMenusMore.spec, by keyboard at 1280).

/** A mouse pointer event at (x, y): jsdom has no PointerEvent, so a MouseEvent carrying its pointerType. */
function pointer(el: Element, type: "pointermove" | "pointerout", x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, relatedTarget: type === "pointerout" ? document.documentElement : null })
  Object.defineProperty(e, "pointerType", { value: "mouse" })
  el.dispatchEvent(e)
}
let prevented: Record<string, boolean[]> = {}
const listen = (e: Event) => (prevented[e.type] ??= []).push(e.defaultPrevented)

beforeEach(() => {
  prevented = {}
  // On window, so it hears each event after React's handlers, whatever they did to it.
  window.addEventListener("pointerout", listen)
  window.addEventListener("pointermove", listen)
})
afterEach(() => {
  window.removeEventListener("pointerout", listen)
  window.removeEventListener("pointermove", listen)
  cleanup()
})

function EveryRow() {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>More actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Follow thread</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Remind me…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>In 1 hour</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuCheckboxItem checked>Show replies</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value="all">
          <DropdownMenuRadioItem value="all">All messages</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const ROWS = [
  ["menuitem", "Follow thread"],
  ["menuitem", "Remind me…"],
  ["menuitemcheckbox", "Show replies"],
  ["menuitemradio", "All messages"],
] as const

describe("a menu row and the mouse", () => {
  for (const [role, name] of ROWS) {
    it(`${name}: a still pointer neither leaves nor moves over it`, () => {
      render(<EveryRow />)
      pointer(document.body, "pointermove", 1232, 667)
      const el = screen.getByRole(role, { name })
      pointer(el, "pointerout", 1232, 667)
      pointer(el, "pointermove", 1232, 667)
      expect(prevented.pointerout).toEqual([true])
      expect(prevented.pointermove).toEqual([false, true])
    })

    it(`${name}: a moving pointer still leaves and moves over it`, () => {
      render(<EveryRow />)
      pointer(document.body, "pointermove", 1232, 667)
      const el = screen.getByRole(role, { name })
      pointer(el, "pointerout", 1240, 690)
      pointer(el, "pointermove", 1236, 671)
      expect(prevented.pointerout).toEqual([false])
      expect(prevented.pointermove).toEqual([false, false])
    })
  }
})
