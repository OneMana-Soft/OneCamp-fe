import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { Editor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { findDoubleDollar, findInlineDollar, insideOpenMath, toggleInlineMath } from "./math"

// Equations in a doc (docs programme B3, editor.md P1-9): typed as $x$, $$x$$
// or $$ and a space, made with ⌘⇧E, stored as TeX alone, and kept out of
// typography's and Markdown's hands while being typed.

// An equation draws with KaTeX and opens its editor from chunks of their own
// (katex.ts, MathEditor.tsx), loaded the first time they're needed. Loaded
// here with the blocks, so a test waits for the editor's own steps and not
// for a module the test runner is still compiling: in a full parallel run,
// the first test to open an equation's editor waited past waitFor's 1 s for
// MathEditor.tsx, and the first to draw one for katex.ts.
beforeAll(() => Promise.all([loadBlocks("doc", ALL_EDITIONS), import("./katex"), import("./MathEditor")]), 30_000)
let restoreRects = () => {}
beforeAll(() => {
  // jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  document.body.innerHTML = ""
})

function docEditor(content = "<p></p>") {
  const el = document.body.appendChild(document.createElement("div"))
  const editor = new Editor({ element: el, extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  editor.commands.focus("end")
  return editor
}

/** Typing, as the browser hands it to the editor (input rules run). */
function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection
    const insert = () => editor.state.tr.insertText(ch, from, to)
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))
    if (!handled) editor.view.dispatch(insert())
  }
}

const inline = (e: Editor) => (e.getJSON().content?.[0].content ?? []).filter((n) => n.type === "inlineMath").map((n) => n.attrs?.latex)

describe("typing an equation", () => {
  it("makes $x^2$ an inline equation, its TeX as typed (no ²)", () => {
    const e = docEditor()
    type(e, "area $x^2$")
    expect(inline(e)).toEqual(["x^2"])
    expect(e.getText()).toBe("area $x^2$")
  })

  it("makes $$x$$ one too, Notion's way", () => {
    const e = docEditor()
    type(e, "so $$a+b$$ ")
    expect(inline(e)).toEqual(["a+b"])
  })

  it("leaves money alone", () => {
    const e = docEditor()
    type(e, "costs $5 and $10, or $5-$10")
    expect(inline(e)).toEqual([])
  })

  it("keeps typography and the Markdown marks out of an equation being typed", () => {
    const e = docEditor()
    type(e, "$f'(x) -> a_1 *b* \"c\"$")
    expect(inline(e)).toEqual(["f'(x) -> a_1 *b* \"c\""])
    // Outside one, typography is as before.
    type(e, " it's")
    expect(e.getText()).toContain("it’s")
  })

  it("makes a block equation of $$ and a space on an empty line, and opens its editor", async () => {
    const e = docEditor()
    type(e, "$$ ")
    expect(e.getJSON().content?.[0].type).toBe("blockMath")
    expect(e.state.selection).toBeInstanceOf(NodeSelection)
    await vi.waitFor(() => expect(document.querySelector("[data-math-editor] textarea")).toBeTruthy())
  })
})

describe("⌘⇧E", () => {
  it("turns the selected text into an equation", () => {
    const e = docEditor("<p>so a^2 + b^2 holds</p>")
    e.commands.setTextSelection({ from: 4, to: 13 })
    expect(toggleInlineMath(e)).toBe(true)
    expect(inline(e)).toEqual(["a^2 + b^2"])
  })

  it("starts an empty one at the caret, and leaves code alone", () => {
    const e = docEditor("<p>x</p>")
    expect(toggleInlineMath(e)).toBe(true)
    expect(e.getJSON().content?.[0].content?.some((n) => n.type === "inlineMath")).toBe(true)
    const code = docEditor("<pre><code>x</code></pre>")
    expect(toggleInlineMath(code)).toBe(false)
  })
})

describe("an equation's HTML", () => {
  it("is Tiptap 3's, with the TeX as its text, and reads back the same", () => {
    const e = docEditor('<p>a <span data-type="inline-math" data-latex="x^2">x^2</span></p><div data-type="block-math" data-latex="\\sum_i i"></div>')
    const html = e.getHTML()
    expect(html).toContain('<span data-latex="x^2" data-type="inline-math">x^2</span>')
    expect(html).toMatch(/<div[^>]*data-latex="\\sum_i i"[^>]*data-type="block-math"[^>]*>\\sum_i i<\/div>/)
    const again = docEditor(html)
    expect(again.getJSON()).toEqual(e.getJSON())
  })

  it("is drawn by KaTeX, its TeX in the tooltip", async () => {
    const e = docEditor('<p>a <span data-type="inline-math" data-latex="x^2"></span></p>')
    const dom = e.view.dom.querySelector('[data-type="inline-math"]') as HTMLElement
    expect(dom.title).toBe("x^2")
    await vi.waitFor(() => expect(dom.querySelector(".katex")).toBeTruthy())
  })
})

describe("the rules", () => {
  it("find $x$ only as the closing $ is typed, never money or an escaped $", () => {
    expect(findInlineDollar("so $x$")?.data).toEqual({ latex: "x" })
    expect(findInlineDollar("$5 and $")).toBeNull()
    expect(findInlineDollar("$5-$")).toBeNull()
    expect(findInlineDollar("\\$x$")).toBeNull()
    expect(findInlineDollar("$ x$")).toBeNull()
    expect(findDoubleDollar("$$x$$")?.data).toEqual({ latex: "x" })
  })

  it("know when the caret is inside an equation being typed", () => {
    expect(insideOpenMath("so $f")).toBe(true)
    expect(insideOpenMath("so $x$ and")).toBe(false)
    expect(insideOpenMath("costs $5")).toBe(false)
    expect(insideOpenMath("a $ b")).toBe(false)
    expect(insideOpenMath("\\$f")).toBe(false)
  })
})

describe("KaTeX", () => {
  it("draws TeX, and says what it can't read", async () => {
    const { mathError, renderMath } = await import("./katex")
    const el = document.createElement("span")
    renderMath(el, "\\frac{1}{2}", false)
    expect(el.querySelector(".katex")).toBeTruthy()
    expect(mathError("\\frac{1}{2}", false)).toBeNull()
    expect(mathError("\\frac{1", false)).toMatch(/expected '}'/)
  })

  it("draws a link's TeX as text, never a link (no trust)", async () => {
    const { renderMath } = await import("./katex")
    const el = document.createElement("span")
    renderMath(el, "\\href{javascript:alert(1)}{x}", false)
    expect(el.querySelector("a")).toBeNull()
  })
})

describe("the equation's editor", () => {
  const field = () => document.querySelector("[data-math-editor] textarea") as HTMLTextAreaElement | null

  it("opens on a click, previews in place for the writer alone, and stores on ↩", async () => {
    const { fireEvent } = await import("@testing-library/react")
    const e = docEditor('<p>a <span data-type="inline-math" data-latex="x"></span> b</p>')
    ;(e.view.dom.querySelector('[data-type="inline-math"]') as HTMLElement).click()
    await vi.waitFor(() => expect(field()).toBeTruthy())
    fireEvent.change(field()!, { target: { value: "y^2" } })
    // Previewed, not stored: nobody else sees it until it's done.
    expect(inline(e)).toEqual(["x"])
    fireEvent.keyDown(field()!, { key: "Enter" })
    await vi.waitFor(() => expect(inline(e)).toEqual(["y^2"]))
    await vi.waitFor(() => expect(field()).toBeNull())
  })

  it("stores what was typed on Escape too, and takes an emptied inline one away", async () => {
    const { fireEvent } = await import("@testing-library/react")
    const e = docEditor('<p>a <span data-type="inline-math" data-latex="x"></span> b</p>')
    ;(e.view.dom.querySelector('[data-type="inline-math"]') as HTMLElement).click()
    await vi.waitFor(() => expect(field()).toBeTruthy())
    fireEvent.change(field()!, { target: { value: "" } })
    fireEvent.keyDown(field()!, { key: "Escape" })
    await vi.waitFor(() => expect(inline(e)).toEqual([]))
    expect(e.getText()).toBe("a  b")
  })

  it("goes with its equation: the block taken away, or the doc closed", async () => {
    const host = () => document.querySelector("[data-doc-floating]")
    const e = docEditor('<p>a <span data-type="inline-math" data-latex="x"></span> b</p>')
    const open = async () => {
      ;(e.view.dom.querySelector('[data-type="inline-math"]') as HTMLElement).click()
      await vi.waitFor(() => expect(field()).toBeTruthy())
    }
    await open()
    // Another person takes the equation away: its editor closes and stores nothing.
    // Left open, it floated with nothing under it, and took the next Escape pressed anywhere.
    e.commands.setContent("<p>gone</p>")
    await vi.waitFor(() => expect(host()).toBeNull())
    expect(e.getText()).toBe("gone")
    // The doc closes with the editor open.
    e.commands.setContent('<p>a <span data-type="inline-math" data-latex="x"></span> b</p>')
    await open()
    editors.splice(editors.indexOf(e), 1)
    e.destroy()
    await vi.waitFor(() => expect(host()).toBeNull())
  })

  it("never opens in a doc the reader can't edit", async () => {
    const e = docEditor('<p>a <span data-type="inline-math" data-latex="x"></span></p>')
    e.setEditable(false)
    ;(e.view.dom.querySelector('[data-type="inline-math"]') as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 50))
    expect(field()).toBeNull()
  })
})
