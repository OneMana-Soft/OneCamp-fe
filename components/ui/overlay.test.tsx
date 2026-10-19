import * as React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { createPortal } from "react-dom"

import { SCREENS, putOnScreen } from "@/lib/testing/screens"
import { OverlayBody, OverlayFooter, useSheetMode } from "@/components/ui/overlay"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useSheetPanel } from "@/components/ui/sheetPanels"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// The one overlay layout (design/drawers-v3/ANALYSIS.md §5): a header, a body
// that is the only scroller, and a footer always in view; the phone rule in
// one place; a choice inside a sheet as a panel of that sheet.

let undo: (() => void) | null = null
afterEach(async () => {
  cleanup()
  undo?.()
  undo = null
  await new Promise((r) => setTimeout(r, 10))
})

const ROOT = join(__dirname, "../..")
const css = (file: string) => readFileSync(join(ROOT, file), "utf8")

describe("the phone rule", () => {
  for (const [name, sheet] of [["a phone in portrait", true], ["a phone in landscape", true], ["a tablet", false], ["a computer", false]] as const) {
    it(`says ${sheet ? "sheets" : "floating overlays"} on ${name}`, () => {
      undo = putOnScreen(SCREENS[name])
      expect(renderHook(() => useSheetMode()).result.current).toBe(sheet)
    })
  }

  it("is floating where there is no matchMedia (the server, a test without a screen)", () => {
    expect(renderHook(() => useSheetMode()).result.current).toBe(false)
  })
})

describe("a popover", () => {
  it("says it floats, and keeps its actions in its footer, out of its body", () => {
    function Mode() {
      return <span data-testid="mode">float</span>
    }
    render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent aria-label="A form">
          <OverlayBody>
            <Mode />
          </OverlayBody>
          <OverlayFooter>
            <button type="button">Save</button>
          </OverlayFooter>
        </PopoverContent>
      </Popover>,
    )
    const content = screen.getByTestId("mode").closest("[data-overlay]")!
    expect(content.getAttribute("data-overlay")).toBe("float")
    expect(screen.getByTestId("mode").textContent).toBe("float")
    const save = screen.getByRole("button", { name: "Save" })
    expect(save.closest("[data-overlay-footer]")).toBeTruthy()
    expect(save.closest("[data-overlay-body]")).toBeNull()
  })
})

describe("the body", () => {
  it("says when there is more to see below it, and above it once scrolled", () => {
    render(
      <OverlayBody data-testid="body">
        <div style={{ height: 800 }} />
      </OverlayBody>,
    )
    const body = screen.getByTestId("body")
    // jsdom lays nothing out: the sizes a browser would give.
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 300 })
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 800 })
    fireEvent.scroll(body)
    expect(body.hasAttribute("data-more-below")).toBe(true)
    expect(body.hasAttribute("data-more-above")).toBe(false)
    body.scrollTop = 500
    fireEvent.scroll(body)
    expect(body.hasAttribute("data-more-above")).toBe(true)
    expect(body.hasAttribute("data-more-below")).toBe(false)
  })
})

describe("a phone's sheet", () => {
  it("says it is a sheet, and keeps its actions in its footer slot, out of its body", () => {
    function Mode() {
      return <span data-testid="mode" />
    }
    render(
      <Drawer open>
        <DrawerContent aria-describedby={undefined} header={<DrawerTitle>A form</DrawerTitle>} footer={<button type="button">Save</button>}>
          <Mode />
        </DrawerContent>
      </Drawer>,
    )
    expect(screen.getByTestId("mode")).toBeTruthy()
    expect(document.querySelector("[data-vaul-drawer]")!.getAttribute("data-overlay")).toBe("sheet")
    const save = screen.getByRole("button", { name: "Save" })
    expect(save.closest("[data-sheet-body]"), "the actions scroll with the content").toBeNull()
    expect(save.closest("[data-sheet-footer]")!.previousElementSibling?.hasAttribute("data-sheet-body")).toBe(true)
  })

  /** A field inside a sheet whose choice opens as a panel of it. */
  function Field() {
    const [open, setOpen] = React.useState(false)
    const [typed, setTyped] = React.useState("")
    const { host } = useSheetPanel(open, "Clears on", () => setOpen(false))
    return (
      <>
        <input aria-label="Words" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="button" onClick={() => setOpen(true)}>
          Pick a day
        </button>
        {host
          ? createPortal(
              <button type="button" onClick={() => setOpen(false)}>
                The 22nd
              </button>,
              host,
            )
          : null}
      </>
    )
  }

  function Sheet() {
    return (
      <Drawer open>
        <DrawerContent aria-describedby={undefined} header={<DrawerTitle>Set a status</DrawerTitle>} footer={<button type="button">Set status</button>}>
          <Field />
        </DrawerContent>
      </Drawer>
    )
  }

  it("opens a choice as a panel of itself, with Back and its name, keeping its footer and what was typed", async () => {
    render(<Sheet />)
    fireEvent.change(screen.getByRole("textbox", { name: "Words" }), { target: { value: "Out" } })
    const opener = screen.getByRole("button", { name: "Pick a day" })
    opener.focus()
    fireEvent.click(opener)
    await act(async () => {})
    expect(document.querySelectorAll("[data-vaul-drawer]")).toHaveLength(1)
    const panel = document.querySelector("[data-sheet-panel]") as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.getAttribute("role")).toBe("region")
    expect((await screen.findByRole("heading", { name: "Clears on" }, { timeout: 8000 }))).toBeTruthy()
    expect(screen.getByRole("button", { name: "Set status" })).toBeTruthy()
    // The sheet's own name stays: hidden under the panel, never gone.
    expect(document.querySelector("[data-sheet-header]")!.textContent).toContain("Set a status")
    // What the sheet holds stays mounted under the panel, hidden.
    expect(document.querySelector("[data-sheet-base]")!.className).toContain("hidden")
    // A pick closes it: the form as it was, and focus back on what opened it.
    fireEvent.click(screen.getByRole("button", { name: "The 22nd" }))
    await act(async () => {})
    expect(document.querySelector("[data-sheet-panel]")).toBeNull()
    expect((screen.getByRole("textbox", { name: "Words" }) as HTMLInputElement).value).toBe("Out")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pick a day" }))
  })

  it("closes the panel at Back and at Escape, one layer a press, and the sheet stays", async () => {
    render(<Sheet />)
    fireEvent.click(screen.getByRole("button", { name: "Pick a day" }))
    await act(async () => {})
    fireEvent.click((await screen.findByRole("button", { name: "Back" }, { timeout: 8000 })))
    await act(async () => {})
    expect(document.querySelector("[data-sheet-panel]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Pick a day" }))
    await act(async () => {})
    fireEvent.keyDown(document.querySelector("[data-sheet-panel]")!, { key: "Escape" })
    await act(async () => {})
    expect(document.querySelector("[data-sheet-panel]")).toBeNull()
    expect(document.querySelector("[data-vaul-drawer]")!.getAttribute("data-state")).toBe("open")
  })
})

describe("the layout's rules (app/overlay.css)", () => {
  const rules = css("app/overlay.css")

  it("makes a floating root that holds a body a column that never scrolls, a popover's at most the room left", () => {
    expect(rules).toMatch(/\[data-overlay="float"\]:has\(> \[data-overlay-body\][^{]*\{\s*display: flex;\s*flex-direction: column;\s*overflow: hidden;/)
    expect(rules).toMatch(/\[data-radix-popper-content-wrapper\] > \[data-overlay="float"\]:has\([^{]*\{\s*max-height: var\(--radix-popover-content-available-height\);/)
  })

  it("makes the body the one scroller, up and down only", () => {
    expect(rules).toMatch(/\[data-overlay-body\] \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/)
  })

  it("keeps the bar quiet in an overlay: no track, a thumb on hover or while scrolling, in each engine", () => {
    expect(rules).toMatch(/\[data-overlay\] ::-webkit-scrollbar-thumb \{\s*background-color: transparent;/)
    expect(rules).toMatch(/\[data-overlay\] \[data-scrolling\]::-webkit-scrollbar-thumb \{\s*background-color: var\(--scroll-bar-color\);/)
    expect(rules).toMatch(/@supports not selector\(::-webkit-scrollbar\) \{[\s\S]*scrollbar-color: transparent transparent;/)
  })

  it("caps a sheet at 640px, centred, on a phone in landscape", () => {
    expect(rules).toMatch(/@media \(pointer: coarse\) and \(max-height: 500px\) and \(min-width: 640px\) \{\s*\[data-vaul-drawer\]\[data-v3-sheet\] \{\s*max-width: 640px;\s*margin-inline: auto;/)
  })

  it("moves a panel with transform and opacity only, a fade under reduced motion", () => {
    expect(rules).toMatch(/@keyframes sheet-panel-in \{\s*from \{\s*opacity: 0;\s*transform: translateX\(24px\);/)
    expect(rules).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.sheet-panel-in \{\s*animation-name: sheet-panel-fade;/)
  })
})

describe("the page's bars (app/globals.css)", () => {
  const globals = css("app/globals.css")

  it("set scrollbar-color and scrollbar-width only where ::-webkit-scrollbar isn't, so Chromium and Safari draw the pill", () => {
    // Chromium 121+ ignores ::-webkit-scrollbar on anything whose
    // scrollbar-color isn't auto; set on *, it turned the pill off everywhere.
    const outside = globals.replace(/@supports not selector\(::-webkit-scrollbar\) \{(?:[^{}]|\{[^{}]*\})*\}/g, "")
    expect(outside, "scrollbar-color outside @supports not selector(::-webkit-scrollbar)").not.toMatch(/scrollbar-color:/)
    expect(outside, "scrollbar-width: thin outside @supports not selector(::-webkit-scrollbar)").not.toMatch(/scrollbar-width:\s*thin/)
    expect(globals).toMatch(/\*::-webkit-scrollbar \{\s*width: 6px;\s*height: 6px;/)
    expect(globals).toMatch(/::-webkit-scrollbar-corner \{\s*background: transparent;/)
  })
})

describe("an overlay's footer part", () => {
  it("is marked, so the guard and the rules know it", () => {
    render(<OverlayFooter data-testid="f" />)
    expect(screen.getByTestId("f").hasAttribute("data-overlay-footer")).toBe(true)
  })
})
