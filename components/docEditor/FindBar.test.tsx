import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { act, fireEvent, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { actionById, registerAction } from "@/components/docEditor/registry/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { NO_BUS } from "@/components/docEditor/registry/commandBus"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { openFind } from "./FindBar"
import { findStateOf } from "@/components/minimal-tiptap/extensions/find-replace/findReplace"

// The find bar (docs programme B3, editor.md P1-12): ⌘F opens it with the
// selection as its search, the count says where you are, going to a match in
// a closed toggle asks B2's toggles.reveal to open it, ⌘⇧H opens Replace,
// ⌘↩ replaces all, and Escape leaves the caret on the match.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
  Element.prototype.scrollIntoView ??= () => {}
})
afterAll(() => restoreRects())

// B2's action, as the contract has it: synchronous, for this viewer, by position.
const revealed: number[] = []
beforeAll(() => {
  const real = actionById("toggles.reveal", { ai: false })
  if (!real) {
    registerAction({ id: "toggles.reveal", label: "Reveal", group: "toggles", surfaces: [], edition: "both", run: (ctx) => void revealed.push(ctx.state?.pos as number) })
    return
  }
  // With B2 merged, its action is registered: record each call, then run it.
  const run = real.run
  real.run = (ctx) => {
    revealed.push(ctx.state?.pos as number)
    return run(ctx)
  }
})

const editors: Editor[] = []
afterEach(async () => {
  for (const e of editors.splice(0)) e.destroy()
  await act(async () => new Promise((r) => setTimeout(r, 0)))
  document.body.innerHTML = ""
})

function docEditor(content: string) {
  const pane = document.body.appendChild(document.createElement("div"))
  pane.className = "doc-scroll"
  const editor = new Editor({ element: pane, extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  return editor
}

const ctxOf = (editor: Editor): ActionContext => ({ docId: "d", editor, canEdit: editor.isEditable, bus: NO_BUS, gate: { ai: false }, state: {} })
const open = (editor: Editor, replace = false) => act(async () => openFind(ctxOf(editor), { replace }))
const field = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement

describe("the find bar", () => {
  it("opens with the selection as its search, and counts where you are", async () => {
    const e = docEditor("<p>launch the launch plan</p>")
    e.commands.setTextSelection({ from: 1, to: 7 })
    await open(e)
    expect(screen.getByRole("search", { name: "Find in doc" })).toBeTruthy()
    expect(field("Find").value).toBe("launch")
    expect(document.activeElement).toBe(field("Find"))
    expect(screen.getByText("1 of 2")).toBeTruthy()
    await act(async () => void fireEvent.keyDown(field("Find"), { key: "Enter" }))
    expect(screen.getByText("2 of 2")).toBeTruthy()
    await act(async () => void fireEvent.keyDown(field("Find"), { key: "Enter", shiftKey: true }))
    expect(screen.getByText("1 of 2")).toBeTruthy()
    await act(async () => void fireEvent.change(field("Find"), { target: { value: "nothing like it" } }))
    expect(screen.getByText("No results")).toBeTruthy()
  })

  // IME sweep (14 Oct 2026): Safari confirms an input method's word with an
  // Enter whose keyCode is 229 and isComposing false; it moved to the next
  // match mid-word.
  it("leaves an input method's Enter to pick its word, and moves on a plain one", async () => {
    const e = docEditor("<p>launch the launch plan</p>")
    e.commands.setTextSelection({ from: 1, to: 7 })
    await open(e)
    expect(screen.getByText("1 of 2")).toBeTruthy()
    await act(async () => void fireEvent.keyDown(field("Find"), { key: "Enter", keyCode: 229 }))
    await act(async () => void fireEvent.keyDown(field("Find"), { key: "Enter", isComposing: true }))
    expect(screen.getByText("1 of 2")).toBeTruthy()
    await act(async () => void fireEvent.keyDown(field("Find"), { key: "Enter" }))
    expect(screen.getByText("2 of 2")).toBeTruthy()
  })

  it("opens the closed toggle a match is in, through B2's toggles.reveal", async () => {
    const e = docEditor('<p>intro</p><div data-type="collapsible" data-title="More" data-open="false"><p>the hidden launch</p></div>')
    await open(e)
    revealed.length = 0
    await act(async () => void fireEvent.change(field("Find"), { target: { value: "hidden" } }))
    const m = findStateOf(e).matches[0]
    expect(revealed).toContain(m.from)
  })

  it("replaces all in one go from ⌘⇧H's field, and says how many", async () => {
    const e = docEditor("<p>alpha beta alpha</p>")
    await open(e)
    await act(async () => void fireEvent.change(field("Find"), { target: { value: "alpha" } }))
    await act(async () => void fireEvent.keyDown(field("Find"), { key: "h", ctrlKey: true, shiftKey: true }))
    await act(async () => new Promise<void>((r) => requestAnimationFrame(() => r())))
    expect(document.activeElement).toBe(field("Replace with"))
    await act(async () => void fireEvent.change(field("Replace with"), { target: { value: "omega" } }))
    await act(async () => void fireEvent.keyDown(field("Replace with"), { key: "Enter", ctrlKey: true }))
    expect(e.getText()).toBe("omega beta omega")
    expect(screen.getByText("Replaced 2")).toBeTruthy()
  })

  it("has no Replace in a doc the reader can't edit", async () => {
    const e = docEditor("<p>alpha</p>")
    e.setEditable(false)
    await open(e, true)
    expect(screen.queryByRole("button", { name: "Replace" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Show replace" })).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Replace with" })).toBeNull()
  })

  it("on a phone keeps the first row for the search: case and word wait with Replace", async () => {
    const real = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q === "(max-width: 639px)", media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    try {
      const e = docEditor("<p>alpha</p>")
      await open(e)
      expect(screen.queryByRole("button", { name: "Match case" })).toBeNull()
      const arrow = screen.getByRole("button", { name: "Show replace" })
      await act(async () => void fireEvent.click(arrow))
      expect(arrow.getAttribute("aria-expanded")).toBe("true")
      expect(screen.getByRole("button", { name: "Match case" })).toBeTruthy()
      expect(screen.getByRole("button", { name: "Whole word" })).toBeTruthy()
      expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy()
      // A reader has no Replace, so keeps them in sight.
      await act(async () => {
        e.destroy()
        await new Promise((r) => setTimeout(r, 0))
      })
      const reader = docEditor("<p>alpha</p>")
      reader.setEditable(false)
      await open(reader)
      expect(screen.getByRole("button", { name: "Match case" })).toBeTruthy()
    } finally {
      window.matchMedia = real
    }
  })

  // QA DSA-22 (14 Oct 2026): on a phone the bar ran across the doc's top and
  // covered its title and line.
  it("on a phone moves the doc down under the bar while it's open, and back when it closes", async () => {
    const real = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q === "(max-width: 639px)", media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    try {
      const e = docEditor("<p>alpha</p>")
      const pane = e.view.dom.closest(".doc-scroll") as HTMLElement
      pane.style.paddingTop = "4px"
      await open(e)
      // Its own padding and the bar's height (jsdom adds them up: calc(12px)).
      expect(pane.style.paddingTop).toMatch(/^calc\(/)
      expect(pane.style.paddingTop).not.toBe("4px")
      await act(async () => void fireEvent.keyDown(field("Find"), { key: "Escape" }))
      await act(async () => new Promise((r) => setTimeout(r, 0)))
      expect(pane.style.paddingTop).toBe("4px")
    } finally {
      window.matchMedia = real
    }
  })

  it("closes on Escape, leaving the match selected and the doc's keys its own", async () => {
    const e = docEditor("<p>one two</p>")
    await open(e)
    await act(async () => void fireEvent.change(field("Find"), { target: { value: "two" } }))
    await act(async () => void fireEvent.keyDown(field("Find"), { key: "Escape" }))
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(screen.queryByRole("search")).toBeNull()
    expect(e.state.doc.textBetween(e.state.selection.from, e.state.selection.to)).toBe("two")
    expect(findStateOf(e).open).toBe(false)
    // Open again with nothing selected: the last search is back.
    e.commands.setTextSelection(1)
    await open(e)
    expect(field("Find").value).toBe("two")
  })

  it("opens without changing the editor's plugins, so collaboration never draws the doc again", async () => {
    const e = docEditor("<p>alpha</p>")
    const plugins = e.state.plugins
    await open(e)
    expect(e.state.plugins).toBe(plugins)
  })

  it("goes when its editor does", async () => {
    const e = docEditor("<p>x</p>")
    await open(e)
    await act(async () => {
      e.destroy()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByRole("search")).toBeNull()
    vi.restoreAllMocks()
  })
})
