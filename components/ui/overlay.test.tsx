import * as React from "react"
import { readdirSync, readFileSync, statSync } from "node:fs"
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
    expect(rules).toMatch(/\[data-overlay="float"\]\[data-overlay-holds-body\] \{\s*display: flex;\s*flex-direction: column;\s*overflow: hidden;/)
    expect(rules).toMatch(/\[data-radix-popper-content-wrapper\] > \[data-overlay="float"\]\[data-overlay-holds-body\] \{\s*max-height: var\(--radix-popover-content-available-height\);/)
  })

  it("lets a box between the root and its body join the column, and a sheet's body that holds one stop scrolling, by the marks the body sets", () => {
    expect(rules).toMatch(/\[data-overlay\] > \[data-overlay-column\]:not\(\[data-overlay-body\], \[data-sheet-base\]\),\s*\[data-overlay\] > \* > \[data-overlay-column\]:not\(\[data-overlay-body\], \[data-sheet-base\]\) \{\s*display: flex;\s*flex-direction: column;\s*flex: 1 1 auto;\s*min-height: 0;/)
    expect(rules).toMatch(/\[data-sheet-body\]\[data-overlay-holds-body\] \{\s*overflow: hidden;/)
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

// The marks app/overlay.css reads in place of :has() (app/selectorKeyGuard.test.ts):
// the body sets them on what holds it and on the boxes between, so each rule
// matches exactly what its :has() matched, and nothing else.
describe("the marks a body sets for the layout", () => {
  // The rules as app/overlay.css had them, each :has() list written out one
  // relative selector at a time: jsdom reads a list inside :has() wrongly (its
  // later entries lose their leading >), which a browser doesn't.
  const has = (subject: string, ...relative: string[]) => relative.map((r) => `${subject}:has(${r})`).join(", ")
  const OLD = {
    root: has('[data-overlay="float"]', "> [data-overlay-body]", "> * > [data-overlay-body]", "> * > * > [data-overlay-body]"),
    popper: has('[data-radix-popper-content-wrapper] > [data-overlay="float"]', "> [data-overlay-body]", "> * > [data-overlay-body]", "> * > * > [data-overlay-body]"),
    box: [
      has("[data-overlay] > :not([data-overlay-body], [data-sheet-base])", "> [data-overlay-body]", "> * > [data-overlay-body]"),
      has("[data-overlay] > * > :not([data-overlay-body], [data-sheet-base])", "> [data-overlay-body]"),
    ].join(", "),
    sheet: has("[data-sheet-body]", "> [data-overlay-body]", "> [data-sheet-base] > [data-overlay-body]"),
  }
  const NEW = {
    root: '[data-overlay="float"][data-overlay-holds-body]',
    popper: '[data-radix-popper-content-wrapper] > [data-overlay="float"][data-overlay-holds-body]',
    box: "[data-overlay] > [data-overlay-column]:not([data-overlay-body], [data-sheet-base]), [data-overlay] > * > [data-overlay-column]:not([data-overlay-body], [data-sheet-base])",
    sheet: "[data-sheet-body][data-overlay-holds-body]",
  }
  /** Each element of `root` the rule matches, by its id: old (:has) beside new (the marks). */
  const matches = (root: Element) =>
    Object.fromEntries(
      (Object.keys(OLD) as (keyof typeof OLD)[]).map((rule) => [
        rule,
        { old: [...root.querySelectorAll(OLD[rule])].map((e) => e.id), new: [...root.querySelectorAll(NEW[rule])].map((e) => e.id) },
      ]),
    )
  const same = (root: Element) => {
    const m = matches(root)
    for (const [rule, { old, new: now }] of Object.entries(m)) expect(now, `${rule}: what the :has() matched`).toEqual(old)
    return m
  }

  it("marks what the :has() rules matched, in every shape they matched, and nothing else", () => {
    const shapes: React.ReactNode[] = [
      // A popover's body, one, two, three and four boxes down; a header and a footer beside it.
      <div key="w1" id="w1" data-radix-popper-content-wrapper=""><div id="r1" data-overlay="float"><OverlayBody id="b1" /></div></div>,
      <div key="r2" id="r2" data-overlay="float"><div id="h2" data-overlay-header="" /><form id="f2"><OverlayBody id="b2" /><div id="t2" data-overlay-footer="" /></form></div>,
      <div key="r3" id="r3" data-overlay="float"><div id="p3"><form id="f3"><OverlayBody id="b3" /></form></div><div id="t3" data-overlay-footer="" /></div>,
      <div key="r4" id="r4" data-overlay="float"><div id="a4"><div id="c4"><div id="d4"><OverlayBody id="b4" /></div></div></div></div>,
      // A sheet's body holding one through its base, and directly; and a sheet's own box.
      <div key="r5" id="r5" data-overlay="sheet"><div id="s5" data-sheet-body=""><div id="e5" data-sheet-base="" style={{ display: "contents" }}><OverlayBody id="b5" /></div></div></div>,
      <div key="r6" id="r6" data-overlay="sheet"><div id="s6" data-sheet-body=""><OverlayBody id="b6" /></div></div>,
      // Not in an overlay at all.
      <div key="n7" id="n7"><div id="m7"><OverlayBody id="b7" /></div></div>,
    ]
    for (const shape of shapes) {
      const { container, unmount } = render(<>{shape}</>)
      same(container)
      unmount()
    }
    // The ones that matter, by name: the popover's root, its box, the sheet's body.
    const { container } = render(<div id="r8" data-overlay="float"><div id="p8"><form id="f8"><OverlayBody id="b8" /></form></div></div>)
    expect(same(container)).toMatchObject({ root: { new: ["r8"] }, box: { new: ["p8", "f8"] } })
  })

  it("keeps a mark while another body still needs it, and takes it off with the last", () => {
    function Two({ both }: { both: boolean }) {
      return (
        <div id="r" data-overlay="float">
          <form id="f">
            <OverlayBody id="b1" />
            {both ? <OverlayBody id="b2" /> : null}
          </form>
        </div>
      )
    }
    const { container, rerender, unmount } = render(<Two both />)
    same(container)
    rerender(<Two both={false} />)
    expect(same(container)).toMatchObject({ root: { new: ["r"] }, box: { new: ["f"] } })
    unmount()
    expect(document.querySelectorAll("[data-overlay-holds-body], [data-overlay-column]")).toHaveLength(0)
  })

  it("leaves a mark written by hand alone (a body that isn't the component marks its own root)", () => {
    const { container, unmount } = render(
      <div id="r" data-overlay="float" data-overlay-holds-body="">
        <div id="raw" data-overlay-body="" />
        <div id="x"><OverlayBody id="b" /></div>
      </div>,
    )
    same(container)
    unmount()
  })

  it("is written by hand wherever a body is: every data-overlay-body outside the component marks its root", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
      }
      return out
    }
    const unmarked = ["components", "app"]
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => !f.endsWith(join("components", "ui", "overlay.tsx")))
      .filter((f) => {
        const src = readFileSync(f, "utf8")
        return /data-overlay-body=/.test(src) && !/data-overlay-holds-body/.test(src)
      })
    expect(unmarked, "a body written by hand: put data-overlay-holds-body on the root that holds it").toEqual([])
  })
})
