import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { findMatches, findStateOf, patternOf, replaceAll, replaceCurrent, setFind, setFindHooks } from "./findReplace"

// Find and replace (docs programme B3, editor.md P1-12): matches across marks,
// Match case and Whole word, the count, Replace and Replace all (one change,
// so one undo), and ⌘⇧H and Escape claimed only while find is open.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)
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

const hooks = { replaced: 0, closed: 0 }
function docEditor(content: string) {
  const el = document.body.appendChild(document.createElement("div"))
  const editor = new Editor({ element: el, extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  // Find's plugin comes with a doc's editor (FindKeys); its keys go to the bar.
  setFindHooks(editor.view, { replace: () => void hooks.replaced++, close: () => void hooks.closed++ })
  return editor
}

const texts = (e: Editor) => findStateOf(e).matches.map((m) => e.state.doc.textBetween(m.from, m.to))
const press = (e: Editor, init: KeyboardEventInit) => {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  e.view.dom.dispatchEvent(ev)
  return ev.defaultPrevented
}

// IME sweep (14 Oct 2026): an input method's Escape (cancelling a word) or
// ⌘⇧H while it composes is its own; Safari's carry keyCode 229 with
// isComposing false, so find closed under it.
describe("an input method's keys", () => {
  it("are left to it while find is open", () => {
    const e = docEditor("<p>launch</p>")
    setFind(e, { open: true, query: "launch" })
    hooks.closed = 0
    const ime = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    Object.defineProperty(ime, "keyCode", { value: 229 })
    e.view.dom.dispatchEvent(ime)
    expect(hooks.closed).toBe(0)
    expect(press(e, { key: "Escape" })).toBe(true)
    expect(hooks.closed).toBe(1)
  })
})

describe("finding", () => {
  it("counts every match, across marks, in code blocks and table cells too", () => {
    const e = docEditor(
      "<p>The <strong>lau</strong>nch plan</p><pre><code>launch()</code></pre><table><tbody><tr><td><p>Launch day</p></td></tr></tbody></table>",
    )
    setFind(e, { open: true, query: "launch" })
    expect(texts(e)).toEqual(["launch", "launch", "Launch"])
    expect(findStateOf(e).current).toBe(0)
  })

  it("narrows with Match case and Whole word", () => {
    const e = docEditor("<p>Launch, launched, LAUNCH and launch.</p>")
    setFind(e, { open: true, query: "launch" })
    expect(texts(e)).toHaveLength(4)
    setFind(e, { caseSensitive: true })
    expect(texts(e)).toEqual(["launch", "launch"])
    setFind(e, { caseSensitive: false, wholeWord: true })
    expect(texts(e)).toEqual(["Launch", "LAUNCH", "launch"])
  })

  it("takes the query literally, and finds nothing for nothing", () => {
    expect(patternOf("a.b(", { caseSensitive: false, wholeWord: false })!.test("xa.b(y")).toBe(true)
    expect(patternOf("", { caseSensitive: false, wholeWord: false })).toBeNull()
    const e = docEditor("<p>a+b and ab</p>")
    expect(findMatches(e.state.doc, "a+b", { caseSensitive: false, wholeWord: false })).toHaveLength(1)
  })

  it("highlights the matches, the current one stronger", () => {
    const e = docEditor("<p>one two one</p>")
    setFind(e, { open: true, query: "one" })
    expect(e.view.dom.querySelectorAll(".doc-find-match")).toHaveLength(2)
    expect(e.view.dom.querySelectorAll("[data-find-current]")).toHaveLength(1)
    setFind(e, { current: 1 })
    expect(e.view.dom.querySelector("[data-find-current]")?.previousSibling?.textContent).toBe(" two ")
    setFind(e, { open: false })
    expect(e.view.dom.querySelectorAll(".doc-find-match")).toHaveLength(0)
  })
})

describe("another person's change", () => {
  it("leaves the matches where they are when collaboration replaces the whole doc", () => {
    const e = docEditor("<p>launch one</p><p>and launch two</p>")
    setFind(e, { open: true, query: "launch" })
    const before = findStateOf(e).matches
    e.view.dispatch(e.state.tr.replaceWith(0, e.state.doc.content.size, e.schema.nodeFromJSON(e.state.doc.toJSON()).content))
    expect(findStateOf(e).matches).toEqual(before)
    // A change in the first paragraph moves the second's match, and drops none past it.
    e.view.dispatch(e.state.tr.insertText("the ", 1))
    expect(texts(e)).toEqual(["launch", "launch"])
  })
})

describe("replacing", () => {
  it("replaces the current match and moves to the next, keeping its marks", () => {
    const e = docEditor("<p><strong>alpha</strong> beta alpha</p>")
    setFind(e, { open: true, query: "alpha" })
    expect(replaceCurrent(e, "gamma")).toBe(true)
    expect(e.getHTML()).toContain("<strong>gamma</strong>")
    expect(texts(e)).toEqual(["alpha"])
    expect(findStateOf(e).current).toBe(0)
  })

  it("replaces all in one change: one undo puts every one back", () => {
    const e = docEditor("<p>alpha beta alpha</p><p>alpha</p>")
    setFind(e, { open: true, query: "alpha" })
    let changes = 0
    e.on("transaction", ({ transaction }) => void (transaction.docChanged && changes++))
    expect(replaceAll(e, "omega")).toBe(3)
    expect(changes).toBe(1)
    expect(e.getText()).toBe("omega beta omega\n\nomega")
    expect(texts(e)).toEqual([])
  })

  it("never replaces in a doc the reader can't edit", () => {
    const e = docEditor("<p>alpha</p>")
    e.setEditable(false)
    setFind(e, { open: true, query: "alpha" })
    expect(replaceAll(e, "x")).toBe(0)
    expect(replaceCurrent(e, "x")).toBe(false)
    expect(e.getText()).toBe("alpha")
  })

  it("searches again once the doc changes under it", async () => {
    const e = docEditor("<p>alpha</p>")
    setFind(e, { open: true, query: "alpha" })
    e.commands.insertContentAt(e.state.doc.content.size, "<p>alpha again</p>")
    await new Promise((r) => setTimeout(r, 260))
    expect(texts(e)).toEqual(["alpha", "alpha"])
  })
})

describe("its keys", () => {
  it("are ⌘⇧H and Escape only while find is open; otherwise the doc's own", () => {
    const e = docEditor("<p>alpha</p>")
    hooks.replaced = hooks.closed = 0
    // Closed, ⌘⇧H isn't find's: it's B2's "reapply the last colour", which may take it.
    press(e, { key: "h", ctrlKey: true, shiftKey: true })
    expect(hooks.replaced).toBe(0)
    setFind(e, { open: true, query: "a" })
    expect(press(e, { key: "h", ctrlKey: true, shiftKey: true })).toBe(true)
    expect(hooks.replaced).toBe(1)
    expect(press(e, { key: "Escape" })).toBe(true)
    expect(hooks.closed).toBe(1)
  })
})
