import * as React from "react"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { SCREENS, putOnScreen, type ScreenName } from "@/lib/testing/screens"
import { SHEET_QUERY } from "@/components/ui/overlayMode"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MenuOnDemand } from "@/components/ui/menuOnDemand"

// On a phone a menu is a bottom sheet (app/overlay.css §8) that rises under the
// finger that opened it. Radix opens a menu on pointerdown, so the sheet was up
// before the finger lifted, and the click the browser sends after it was
// hit-tested against the row that had risen there, and chose it: a tap on the
// call dock's "More" could start a recording (CALLS-LEAD, 20 Oct 2026). On a
// phone a press opens the menu on its click; a computer and the keyboard open
// it as they did.

// jsdom has no PointerEvent: a mouse event that says which pointer it was.
class TestPointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? "mouse"
  }
}
const realPointerEvent = window.PointerEvent
beforeAll(() => {
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent
})
afterAll(() => {
  window.PointerEvent = realPointerEvent
})

let leave = () => {}
afterEach(() => {
  cleanup()
  leave()
  leave = () => {}
})
const on = (screenName: ScreenName) => {
  leave = putOnScreen(SCREENS[screenName])
}

/** The call dock's "More", its rows acting on a click as the dock's do. */
function CallMore({ chosen, onTriggerClick }: { chosen: (row: string) => void; onTriggerClick?: React.MouseEventHandler }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More call options" onClick={onTriggerClick}>
          More
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end">
        <DropdownMenuItem onSelect={() => chosen("share")}>Share screen</DropdownMenuItem>
        <DropdownMenuItem onClick={() => chosen("people")}>Participants</DropdownMenuItem>
        <DropdownMenuItem onClick={() => chosen("record")}>Record call</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const TOUCH = { button: 0, ctrlKey: false, pointerType: "touch", pointerId: 7, isPrimary: true }
const MOUSE = { button: 0, ctrlKey: false, pointerType: "mouse", pointerId: 1, isPrimary: true }

/**
 * A finger's tap on `el`, as a phone's browser sends it: down; the page goes
 * on (a sheet that opened mounts and rises from the foot, under the finger);
 * up, to the element pressed (a touch's pointer is captured by it); then the
 * click, hit-tested where the finger was: on the risen sheet's last row, if a
 * sheet opened, or else on what was pressed.
 */
async function fingerTap(el: HTMLElement) {
  fireEvent.pointerDown(el, TOUCH)
  await act(async () => {})
  fireEvent.pointerUp(el, TOUCH)
  fireEvent.click(screen.queryAllByRole("menuitem").at(-1) ?? el, { detail: 1 })
  await act(async () => {})
}

/** The trigger, found before the menu opens: an open menu hides the page from a screen reader (and from getByRole). */
const trigger = () => screen.getByRole("button", { name: "More call options" })

describe("a menu on a phone", () => {
  it("opens on the tap's click, so the click can't choose the row that rose under the finger", async () => {
    on("a phone in portrait")
    const chosen = vi.fn()
    render(<CallMore chosen={chosen} />)
    const t = trigger()
    await fingerTap(t)
    expect(chosen).not.toHaveBeenCalled()
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(t.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getAllByRole("menuitem").map((r) => r.textContent)).toEqual(["Share screen", "Participants", "Record call"])
  })

  it("opens the same way in landscape", async () => {
    on("a phone in landscape")
    const chosen = vi.fn()
    render(<CallMore chosen={chosen} />)
    const t = trigger()
    await fingerTap(t)
    expect(chosen).not.toHaveBeenCalled()
    expect(t.getAttribute("aria-expanded")).toBe("true")
  })

  it("chooses a row with a second tap, once the sheet is up", async () => {
    on("a phone in portrait")
    const chosen = vi.fn()
    render(<CallMore chosen={chosen} />)
    const t = trigger()
    await fingerTap(t)
    const row = screen.getByRole("menuitem", { name: "Participants" })
    fireEvent.pointerDown(row, TOUCH)
    fireEvent.pointerUp(row, TOUCH)
    fireEvent.click(row, { detail: 1 })
    await act(async () => {})
    expect(chosen.mock.calls).toEqual([["people"]])
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("opens on the click after a mouse's press and release too, in a window as narrow as a phone, choosing nothing", async () => {
    leave = putOnScreen({ width: 390, height: 844, coarse: false })
    const chosen = vi.fn()
    render(<CallMore chosen={chosen} />)
    const t = trigger()
    fireEvent.pointerDown(t, MOUSE)
    await act(async () => {})
    // A mouse isn't captured: its release, and its click, land on what is under it then.
    const under = () => screen.queryAllByRole("menuitem").at(-1) ?? t
    fireEvent.pointerUp(under(), MOUSE)
    fireEvent.click(under(), { detail: 1 })
    await act(async () => {})
    expect(chosen).not.toHaveBeenCalled()
    expect(t.getAttribute("aria-expanded")).toBe("true")
  })

  it("opens nothing for a press that never becomes a click (the finger scrolled the page)", async () => {
    on("a phone in portrait")
    render(<CallMore chosen={vi.fn()} />)
    const t = trigger()
    fireEvent.pointerDown(t, TOUCH)
    await act(async () => {})
    fireEvent.pointerCancel(t, TOUCH)
    await act(async () => {})
    expect(screen.queryByRole("menu")).toBeNull()
    expect(t.getAttribute("aria-expanded")).toBe("false")
  })

  it("stays shut when the trigger's own click says the press was something else (a hold to dictate)", async () => {
    on("a phone in portrait")
    const chosen = vi.fn()
    render(<CallMore chosen={chosen} onTriggerClick={(e) => e.preventDefault()} />)
    const t = trigger()
    await fingerTap(t)
    expect(chosen).not.toHaveBeenCalled()
    expect(screen.queryByRole("menu")).toBeNull()
  })
})

describe("a menu on a computer", () => {
  it("opens on the pointer's press, before any click, as it always has", async () => {
    on("a computer")
    render(<CallMore chosen={vi.fn()} />)
    const t = trigger()
    fireEvent.pointerDown(t, MOUSE)
    await act(async () => {})
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(t.getAttribute("aria-expanded")).toBe("true")
  })

  it("is a popover there: a tablet keeps its press too", async () => {
    on("a tablet")
    render(<CallMore chosen={vi.fn()} />)
    const t = trigger()
    fireEvent.pointerDown(t, TOUCH)
    await act(async () => {})
    expect(t.getAttribute("aria-expanded")).toBe("true")
  })
})

/** A card's "⋯" whose menu joins the page on the press that opens it (components/ui/menuOnDemand). */
function CardMore({ chosen }: { chosen: (row: string) => void }) {
  return (
    <MenuOnDemand
      menu={(onDemand) => (
        <DropdownMenuContent {...onDemand}>
          <DropdownMenuItem onSelect={() => chosen("open")}>Open</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => chosen("delete")}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      )}
    >
      <button type="button" aria-label="Card actions">
        ⋯
      </button>
    </MenuOnDemand>
  )
}

describe("a menu on demand, which joins the page on the press that opens it", () => {
  it("opens on a phone on the tap's click as every menu does, so the click can't choose the row that rose under the finger", async () => {
    on("a phone in portrait")
    const chosen = vi.fn()
    render(<CardMore chosen={chosen} />)
    const t = screen.getByRole("button", { name: "Card actions" })
    await fingerTap(t)
    expect(chosen).not.toHaveBeenCalled()
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(t.getAttribute("aria-expanded")).toBe("true")
  })

  it("opens on a computer on the pointer's press, before any click", async () => {
    on("a computer")
    render(<CardMore chosen={vi.fn()} />)
    const t = screen.getByRole("button", { name: "Card actions" })
    fireEvent.pointerDown(t, MOUSE)
    await act(async () => {})
    expect(screen.getByRole("menu")).toBeTruthy()
    expect(t.getAttribute("aria-expanded")).toBe("true")
  })
})

describe("the keyboard", () => {
  for (const screenName of ["a phone in portrait", "a computer"] as const) {
    for (const key of ["Enter", " ", "ArrowDown"]) {
      it(`opens the menu with ${key === " " ? "Space" : key} on ${screenName}, its first row focused, and a click with no press after it changes nothing`, async () => {
        on(screenName)
        render(<CallMore chosen={vi.fn()} />)
    const t = trigger()
        t.focus()
        fireEvent.keyDown(t, { key })
        await act(async () => {})
        expect(t.getAttribute("aria-expanded")).toBe("true")
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0))
        })
        expect(document.activeElement?.textContent).toBe("Share screen")
        // A browser that sends a click for the key (Space's keyup) toggles nothing.
        fireEvent.click(t)
        await act(async () => {})
        expect(t.getAttribute("aria-expanded")).toBe("true")
      })
    }
  }
})

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

describe("the phone rule the trigger asks", () => {
  it("is overlayMode's SHEET_QUERY, word for word (the primitive keeps its own copy, off overlayMode's bytes)", () => {
    const src = readFileSync(join(process.cwd(), "components/ui/dropdown-menu.tsx"), "utf8")
    expect(src).toContain(JSON.stringify(SHEET_QUERY))
  })
})

describe("every menu shares the primitive's trigger", () => {
  it("takes no part of a menu from Radix beside the primitive's: Radix's own trigger opens on the press", () => {
    const root = process.cwd()
    const mixed = ["components", "app"]
      .flatMap((d) => walk(join(root, d)))
      .filter((f) => !f.endsWith(join("components", "ui", "dropdown-menu.tsx")))
      .filter((f) => {
        const src = readFileSync(f, "utf8")
        return /from\s+["']@\/components\/ui\/dropdown-menu["']/.test(src) && /import\s+(?!type\b)[^;]*from\s+["']@radix-ui\/react-dropdown-menu["']/.test(src)
      })
      .map((f) => f.slice(root.length + 1))
    expect(mixed, "import the menu's parts from @/components/ui/dropdown-menu").toEqual([])
  })
})
