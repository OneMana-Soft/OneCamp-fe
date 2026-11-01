import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { keepOffTheSheet, sheetSlot } from "@/components/ui/toastFootSlot"

// V-111 (DESIGN-BUILD-43, 30 Oct): at 390 a refused Export CSV's toast came in
// under the top bar, which on the tall sort and filter sheet is ON its header:
// over "Sort and filter" and its Export CSV. The time dialog's sheet kept its
// toast at its foot, over By person. One rule now, for every sheet: the toasts
// keep off its header, its buttons and its foot.

describe("where the toasts go while a sheet is open on a phone", () => {
  const onScreen = (least: number) => (top: number) => top >= least

  it("in the dimmed gap above the sheet, 8px clear of its edge, when they fit there", () => {
    // The filter sheet at 390x844 leaves ~68px over it for a ~47px toast.
    expect(sheetSlot({ edge: 68, head: 124 }, 47, onScreen(8))).toEqual({ top: 13, above: true })
    // A short sheet (the time dialog's): just over its edge, near the thumb, not under the bar.
    expect(sheetSlot({ edge: 520, head: 580 }, 44, onScreen(8))).toEqual({ top: 468, above: true })
  })

  it("else over its content, 8px under its header row, and under the field in use when that is there", () => {
    expect(sheetSlot({ edge: 50, head: 124 }, 47, onScreen(8))).toEqual({ top: 132, above: false })
    expect(sheetSlot({ edge: 50, head: 124 }, 47, onScreen(8), { top: 128, bottom: 168 })).toEqual({ top: 176, above: false })
    // A field lower down leaves the place as it is.
    expect(sheetSlot({ edge: 50, head: 124 }, 47, onScreen(8), { top: 400, bottom: 440 })).toEqual({ top: 132, above: false })
  })

  // The stack is measured by the step it is drawn with: each toast behind the
  // front one moves 10px (app/globals.css, --toast-sy). Read from both files,
  // so neither changes alone.
  it("measures the stack by the step the CSS draws it with", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8")
    const step = /\bconst STEP = (\d+)\b/.exec(read("components/ui/toastFootSlot.ts"))?.[1]
    const drawn = /--toast-sy: calc\(var\(--toast-i, 0\) \* (\d+)px \* var\(--toast-dir\)\)/.exec(read("app/globals.css"))?.[1]
    expect(step).toMatch(/^\d+$/)
    expect(drawn).toBe(step)
  })
})

describe("keepOffTheSheet", () => {
  let frames: FrameRequestCallback[] = []
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0))
    const run = frames
    frames = []
    run.forEach((f) => f(0))
  }
  let safeTop = 8
  const box = (el: Element, top: number, bottom: number) => {
    el.getBoundingClientRect = () => ({ top, bottom, height: bottom - top, left: 0, right: 390, width: 390, x: 0, y: top, toJSON() {} }) as DOMRect
  }
  let list: HTMLOListElement
  let sheet: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f))
    vi.stubGlobal("cancelAnimationFrame", () => {})
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
    document.body.innerHTML = `
      <ol class="toast-viewport"><li class="toast-root" data-state="open">Couldn't export the list</li></ol>
      <div data-v3-sheet="" data-state="open" aria-labelledby="t">
        <div data-v3-grabber=""></div>
        <div><h2 id="t">Sort and filter</h2><button>Export CSV</button></div>
        <div>The options</div>
        <button>Clear filters</button><button>Apply</button>
      </div>`
    list = document.querySelector("ol")!
    sheet = document.querySelector("[data-v3-sheet]")!
    // What app/phone.css does with the place: never under the safe top.
    list.getBoundingClientRect = () => ({ top: Math.max(parseFloat(list.style.getPropertyValue("--toast-sheet-top")), safeTop) }) as DOMRect
    box(sheet, 68, 844)
    box(sheet.querySelector("[data-v3-grabber]")!, 74, 79)
    box(sheet.querySelector("h2")!, 92, 116)
    box(sheet.querySelector("button")!, 86, 126)
    sheet.querySelectorAll("button").forEach((b, i) => i > 0 && box(b, 772, 816))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
    frames = []
    safeTop = 8
  })

  it("places the toasts in the gap over the sheet when they fit, and under its header row when they don't", async () => {
    const stop = keepOffTheSheet(list)
    await flush()
    // 68 - 8 - 44 (a pill): 16, under no button.
    expect([list.dataset.sheetSlot, list.style.getPropertyValue("--toast-sheet-top")]).toEqual(["above", "16px"])
    // An installed app under a 47px status bar: no room over it, so under the header row (Export CSV's foot, 126) + 8.
    safeTop = 47
    window.dispatchEvent(new Event("resize"))
    await flush()
    expect([list.dataset.sheetSlot, list.style.getPropertyValue("--toast-sheet-top")]).toEqual(["below", "134px"])
    stop()
    expect(list.dataset.sheetSlot).toBeUndefined()
    expect(list.style.getPropertyValue("--toast-sheet-top")).toBe("")
  })

  // V-111: the task's sheet (OverlaySheet) is named by a hidden title while the task loads, then by the task's name
  // it shows. A toast already up when the name shows moves under it.
  it("places the toasts again, 8px under the title, when the sheet takes its name from a title it shows", async () => {
    sheet.insertAdjacentHTML("beforeend", '<span id="loading">Task</span><p id="name">Book the venue</p>')
    box(document.getElementById("loading")!, 0, 1)
    box(document.getElementById("name")!, 140, 172)
    sheet.setAttribute("aria-labelledby", "loading")
    safeTop = 47
    const stop = keepOffTheSheet(list)
    await flush()
    // No room over it (16 is under the safe top, 47), and a one-pixel title counts as none: 8px under the grabber (79).
    expect([list.dataset.sheetSlot, list.style.getPropertyValue("--toast-sheet-top")]).toEqual(["below", "87px"])
    sheet.setAttribute("aria-labelledby", "name")
    await flush()
    expect([list.dataset.sheetSlot, list.style.getPropertyValue("--toast-sheet-top")]).toEqual(["below", "180px"])
    stop()
  })

  it("lets go when the sheet starts to close, or when no toast shows", async () => {
    const stop = keepOffTheSheet(list)
    await flush()
    expect(list.dataset.sheetSlot).toBe("above")
    sheet.setAttribute("data-state", "closed")
    await flush()
    expect(list.dataset.sheetSlot).toBeUndefined()
    sheet.setAttribute("data-state", "open")
    list.querySelector("li")!.setAttribute("data-state", "closed")
    await flush()
    expect(list.dataset.sheetSlot).toBeUndefined()
    stop()
  })

  it("does nothing off a phone", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
    const stop = keepOffTheSheet(list)
    await flush()
    expect(list.dataset.sheetSlot).toBeUndefined()
    stop()
  })
})
