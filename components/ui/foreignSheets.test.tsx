import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { dockForeignSheets, useForeignSheets, type ForeignSheet } from "@/components/ui/foreignSheets"

/**
 * A library's own overlays as the app's sheets (components/ui/foreignSheets,
 * miro-40 H1): their roots are marked with the sheet's detent, only inside
 * the library's scope, as they mount (a dialog's portal on the body too), and
 * the marks go when overlays stop being sheets. Nothing is added to the
 * library's tree.
 */

const SHEETS: readonly ForeignSheet[] = [
  { name: "menu", classes: ["menu"], detent: "menu" },
  { name: "picker", classes: ["picker"], box: "[data-wrapper]", detent: "medium" },
  { name: "dialog", classes: ["dialog"], detent: "large", actions: ["dialog-buttons"] },
]

/** Lets the observer see what was just added. */
const settle = () => new Promise((r) => setTimeout(r, 0))
const add = (parent: Element, html: string) => {
  parent.insertAdjacentHTML("beforeend", html)
  return parent.lastElementChild!
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
})

/** A ResizeObserver whose sizes the test reports: the boxes it watches, and a report of `target` at `height`. */
function fakeSizes() {
  const made: { report: ResizeObserverCallback; watched: Set<Element> }[] = []
  vi.stubGlobal(
    "ResizeObserver",
    class {
      watched = new Set<Element>()
      constructor(public report: ResizeObserverCallback) {
        made.push(this)
      }
      observe(el: Element) {
        this.watched.add(el)
      }
      unobserve(el: Element) {
        this.watched.delete(el)
      }
      disconnect() {
        this.watched.clear()
      }
    },
  )
  const watched = () => new Set(made.flatMap((o) => [...o.watched]))
  const resize = (target: Element, height: number) => {
    for (const o of made.filter((m) => m.watched.has(target))) {
      o.report([{ target, borderBoxSize: [{ blockSize: height, inlineSize: 390 }] } as unknown as ResizeObserverEntry], o as unknown as ResizeObserver)
    }
  }
  return { watched, resize }
}

describe("dockForeignSheets", () => {
  it("marks a root inside the scope with its detent, and never a class the app shares outside it", () => {
    const lib = add(document.body, '<div class="lib"><div class="menu"></div></div>')
    const ours = add(document.body, '<nav><div class="menu"></div></nav>')
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    expect(lib.querySelector(".menu")!.getAttribute("data-foreign-sheet")).toBe("menu")
    expect(ours.querySelector(".menu")!.hasAttribute("data-foreign-sheet")).toBe(false)
    undo()
  })

  it("marks an overlay as it mounts, a portal on the body included, and its actions row", async () => {
    const lib = add(document.body, '<div class="lib"></div>')
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    const menu = add(lib, '<div><div class="menu"></div></div>').firstElementChild!
    const portal = add(document.body, '<div class="lib portal"></div>')
    const dialog = add(portal, '<div class="dialog"><p>Help</p></div>')
    await settle()
    expect(menu.getAttribute("data-foreign-sheet")).toBe("menu")
    expect(dialog.getAttribute("data-foreign-sheet")).toBe("large")
    // The actions mount after the dialog's root: still pinned.
    const buttons = add(dialog, '<div class="dialog-buttons"><button>Save</button></div>')
    await settle()
    expect(buttons.hasAttribute("data-foreign-sheet-actions")).toBe(true)
    undo()
  })

  it("docks the positioned box a wrapper puts round the root, not the root", async () => {
    const lib = add(document.body, '<div class="lib"></div>')
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    const wrapper = add(lib, '<div data-wrapper style="transform: translate(10px, 20px)"><div class="picker"></div></div>')
    await settle()
    expect(wrapper.getAttribute("data-foreign-sheet")).toBe("medium")
    expect(wrapper.querySelector(".picker")!.hasAttribute("data-foreign-sheet")).toBe(false)
    undo()
  })

  it("keeps a root inside a docked sheet that sheet's, never a sheet of its own, whichever mounts first", async () => {
    const lib = add(document.body, '<div class="lib"></div>')
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    try {
      // A popover holding a menu's list (Excalidraw's font list): the popover is the one sheet.
      const popover = add(lib, '<div data-wrapper><div class="picker"><div class="menu"></div></div></div>')
      await settle()
      expect(popover.getAttribute("data-foreign-sheet")).toBe("medium")
      expect(popover.querySelector(".menu")!.hasAttribute("data-foreign-sheet")).toBe(false)
      // A menu docked on its own, then held by a popover that docks round it: the menu gives its sheet up.
      const menu = add(lib, '<div class="menu"></div>')
      await settle()
      expect(menu.getAttribute("data-foreign-sheet")).toBe("menu")
      const outer = add(lib, '<div data-wrapper><div class="picker"></div></div>')
      outer.firstElementChild!.append(menu)
      await settle()
      expect(outer.getAttribute("data-foreign-sheet")).toBe("medium")
      expect(menu.hasAttribute("data-foreign-sheet")).toBe(false)
      expect(lib.querySelectorAll("[data-foreign-sheet]")).toHaveLength(2)
    } finally {
      undo()
    }
  })

  it("marks no actions row outside a sheet", async () => {
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    const loose = add(document.body, '<div class="lib"><div class="dialog-buttons"></div></div>').firstElementChild!
    await settle()
    expect(loose.hasAttribute("data-foreign-sheet-actions")).toBe(false)
    undo()
  })

  it("marks the library's own layers under the sheet's that hold a docked sheet, and no other box", async () => {
    // Excalidraw's top bar is a layer of its own (absolute, z-index 4) under the page's chrome (z-index 20):
    // a sheet inside it could rise only within it, so it is marked for foreignSheets.css to lift. Its dialogs'
    // layer (z-index 1000) is over the sheet's already (the modal layer, as foreignSheets.css sets it): left be.
    const layer = add(document.head, "<style>[data-foreign-sheet] { z-index: 500 }</style>")
    const lib = add(document.body, '<div class="lib" style="position: relative"><div class="bar" style="position: absolute; z-index: 4"><section></section></div></div>')
    const dialogs = add(document.body, '<div class="lib" style="position: fixed; z-index: 1000"></div>')
    const chrome = add(document.body, '<div style="position: absolute; z-index: 20"><div class="menu"></div></div>')
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    try {
      const bar = lib.querySelector(".bar")!
      expect(bar.hasAttribute("data-foreign-sheet-lift")).toBe(false)
      add(bar.querySelector("section")!, '<div class="menu"></div>')
      add(dialogs, '<div><div class="dialog"></div></div>')
      await settle()
      expect(bar.hasAttribute("data-foreign-sheet-lift")).toBe(true)
      expect(dialogs.querySelector(".dialog")!.getAttribute("data-foreign-sheet")).toBe("large")
      expect(dialogs.hasAttribute("data-foreign-sheet-lift")).toBe(false)
      // Positioned with no z-index makes no layer; the page's chrome holds no docked sheet; the body is never marked.
      expect(lib.hasAttribute("data-foreign-sheet-lift")).toBe(false)
      expect(chrome.hasAttribute("data-foreign-sheet-lift")).toBe(false)
      expect(document.body.hasAttribute("data-foreign-sheet-lift")).toBe(false)
    } finally {
      undo()
      layer.remove()
    }
    expect(document.querySelectorAll("[data-foreign-sheet-lift]")).toHaveLength(0)
  })

  it("takes every mark off on undo, and marks nothing after it", async () => {
    const lib = add(document.body, '<div class="lib"><div class="dialog"><div class="dialog-buttons"></div></div></div>')
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    expect(document.querySelectorAll("[data-foreign-sheet], [data-foreign-sheet-actions]")).toHaveLength(2)
    undo()
    expect(document.querySelectorAll("[data-foreign-sheet], [data-foreign-sheet-actions]")).toHaveLength(0)
    add(lib, '<div class="menu"></div>')
    await settle()
    expect(document.querySelectorAll("[data-foreign-sheet]")).toHaveLength(0)
  })

  // The row of actions is pinned on the sheet's foot out of what scrolls
  // (foreignSheets.css), so the sheet keeps the row's height free under what
  // it holds, and its end scrolls clear of the row (miro-40 H1).
  it("keeps its row of actions' height free under the sheet as the row's height changes, until the row goes or the dock ends", async () => {
    const sizes = fakeSizes()
    const lib = add(document.body, '<div class="lib"></div>')
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    const dialog = add(lib, '<div class="dialog"><p>Export</p><div class="dialog-buttons"><button>PNG</button></div></div>') as HTMLElement
    await settle()
    const row = dialog.querySelector(".dialog-buttons")!
    const reserve = () => dialog.style.getPropertyValue("--foreign-sheet-actions")
    expect(sizes.watched().has(row)).toBe(true)
    sizes.resize(row, 119)
    expect(reserve()).toBe("119px")
    sizes.resize(row, 64)
    expect(reserve()).toBe("64px")
    // The row goes and the sheet stays: nothing kept free, and the row is let go.
    row.remove()
    sizes.resize(row, 0)
    expect(reserve()).toBe("")
    expect(sizes.watched().has(row)).toBe(false)
    const again = add(dialog, '<div class="dialog-buttons"><button>SVG</button></div>')
    await settle()
    sizes.resize(again, 80)
    expect(reserve()).toBe("80px")
    undo()
    expect(reserve()).toBe("")
    expect(sizes.watched().size).toBe(0)
  })

  it("measures a row of actions the sheet holds when it docks, and only rows inside a sheet", async () => {
    const sizes = fakeSizes()
    const dialog = add(document.body, '<div class="lib"><div class="dialog"><div class="dialog-buttons"></div></div></div>').firstElementChild as HTMLElement
    const loose = add(document.body, '<div class="lib"><div class="dialog-buttons"></div></div>').firstElementChild!
    const undo = dockForeignSheets(document.body, ".lib", SHEETS)
    sizes.resize(dialog.firstElementChild!, 52)
    expect(dialog.style.getPropertyValue("--foreign-sheet-actions")).toBe("52px")
    expect(sizes.watched().has(loose)).toBe(false)
    undo()
  })
})

describe("useForeignSheets", () => {
  function Board({ on }: { on: boolean }) {
    useForeignSheets(on, ".lib", SHEETS)
    return <div className="lib"><div className="menu" data-testid="menu" /></div>
  }

  it("docks only while the page says overlays are sheets", () => {
    const { getByTestId, rerender } = render(<Board on={false} />)
    expect(getByTestId("menu").hasAttribute("data-foreign-sheet")).toBe(false)
    rerender(<Board on />)
    expect(getByTestId("menu").getAttribute("data-foreign-sheet")).toBe("menu")
    rerender(<Board on={false} />)
    expect(getByTestId("menu").hasAttribute("data-foreign-sheet")).toBe(false)
  })
})

// A mask clips all its box holds, a fixed box too (Chromium and WebKit alike).
// A phone's tool row fades its edges as every strip does (data-edge-fade,
// app/interaction.css), and More tools' sheet, docked inside the row, stood on
// the screen's foot drawn only within the row, while a finger met the board
// under it: on the board page and on a call's stage (miro-40 H1).
describe("foreignSheets.css", () => {
  const read = (file: string) => readFileSync(join(__dirname, "..", "..", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

  it("drops the mask of every strip app/interaction.css fades while the strip holds a docked sheet", () => {
    const faded = new Set<string>()
    for (const [, prelude] of read("app/interaction.css").matchAll(/([^{};]+)\{[^{}]*\bmask-image:/g)) {
      for (const [, attr] of prelude.matchAll(/\[(data-[\w-]+)/g)) faded.add(attr)
    }
    expect(faded.size, "app/interaction.css fades its strips with a mask").toBeGreaterThan(0)
    const rules = [...read("components/ui/foreignSheets.css").matchAll(/([^{};]+)\{([^{}]*)\}/g)]
    for (const attr of faded) {
      const unmasked = rules.some(
        ([, prelude, body]) =>
          prelude.split(",").some((s) => s.trim() === `[${attr}]:has([data-foreign-sheet])`) &&
          /(^|[\s;])mask-image:\s*none/.test(body) &&
          /-webkit-mask-image:\s*none/.test(body),
      )
      expect(unmasked, `[${attr}] drops its mask while it holds a docked sheet`).toBe(true)
    }
  })

  // A sticky row rises only within the box that holds it: Save as image's
  // row, the last of Excalidraw's settings box, stopped 6.4 px past the
  // screen's foot at 390x664 and 18.8 px at 390x844 (miro-40 H1). Pinned, it
  // is fixed on the sheet's foot; and a box whose entrance holds a transform
  // at its end (Excalidraw's dialogs fade in from a scale, filling forwards)
  // is the containing block of what is fixed in it, so the row would scroll
  // away with what the sheet holds: the sheet makes its own entrance.
  it("pins a sheet's row of actions on its foot, the keyboard's too, keeps the row's height free under what it holds, and makes its own entrance", () => {
    const rules = [...read("components/ui/foreignSheets.css").matchAll(/([^{};]+)\{([^{}]*)\}/g)]
    const rule = (sel: string) =>
      rules
        .filter(([, prelude]) => prelude.split(",").some((s) => s.trim() === sel))
        .map(([, , body]) => body)
        .join(";")
    const sheet = rule("[data-foreign-sheet]")
    const keyboard = rule('html[data-keyboard="open"] [data-foreign-sheet]')
    const actions = rule("[data-foreign-sheet] [data-foreign-sheet-actions]")
    expect(actions, "the row is fixed, never sticky").toMatch(/position:\s*fixed\s*!important/)
    expect(actions).toMatch(/inset:\s*auto 0 0\s*!important/)
    expect(actions).toMatch(/max-width:\s*640px\s*!important/)
    const foot = keyboard.match(/(?:^|[\s;])bottom:\s*([^;]+?)\s*!important/)?.[1]
    expect(foot, "the sheet stands on the keyboard").toBeTruthy()
    expect(rule('html[data-keyboard="open"] [data-foreign-sheet] [data-foreign-sheet-actions]'), "its row stands there too").toMatch(
      new RegExp(`(^|[\\s;])bottom:\\s*${foot!.replace(/[()*+.?[\]\\^$|]/g, "\\$&")}\\s*!important`),
    )
    for (const [what, body] of [["the sheet", sheet], ["the sheet on the keyboard", keyboard]] as const) {
      expect(body, `${what} keeps its row's height free under what it holds`).toMatch(/padding-bottom:\s*var\(--foreign-sheet-actions,/)
    }
    expect(sheet, "the library's entrance goes").toMatch(/(^|[\s;])animation:\s*none\s*!important/)
    expect(sheet, "drawn whole: a library's box can start its entrance at nothing").toMatch(/opacity:\s*1\s*!important/)
    const rise = rules.find(([, prelude, body]) => prelude.trim() === "[data-foreign-sheet]" && /animation:\s*foreign-sheet-rise/.test(body))?.[2] ?? ""
    expect(rise, "the sheet's rise is its entrance").toMatch(/!important/)
    expect(rise, "and holds nothing once it ends").not.toMatch(/\b(forwards|both)\b/)
  })
})
