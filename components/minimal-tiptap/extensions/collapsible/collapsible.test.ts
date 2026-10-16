import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Editor, type JSONContent } from "@tiptap/core"

import "@/components/docEditor/registry"
import { actionById } from "@/components/docEditor/registry/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { turnIntoFor } from "@/components/docEditor/registry/readers"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { offlineProvider } from "@/components/docEditor/docTestKit"
import { INDENT_ATTR } from "../indent/indent"
import { isToggleOpen, resetToggleStates, setTogglesOpen } from "./toggleState"

// Toggles (B2; editor.md P1-7, K7, K16, N7, N13): the summary is a real line,
// open or closed is each viewer's own, and nothing a toggle or a callout holds
// is lifted out of it by Turn into.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  resetToggleStates()
})

function docEditor(content: string | JSONContent, more: Partial<ReturnType<typeof bareContext>> = {}) {
  const editor = new Editor({ extensions: extensionsFor({ ...bareContext("doc"), ...more }), content })
  editors.push(editor)
  return editor
}

// A block's id, and B1's indent at its default (0), say nothing about a toggle.
const unsaid = (k: string, v: unknown) => k === "blockId" || v === null || (k === INDENT_ATTR && v === 0)
const strip = (n: JSONContent): JSONContent => {
  const { attrs, content, ...rest } = n
  const kept = attrs ? Object.fromEntries(Object.entries(attrs).filter(([k, v]) => !unsaid(k, v))) : undefined
  return { ...rest, ...(kept && Object.keys(kept).length ? { attrs: kept } : {}), ...(content ? { content: content.map(strip) } : {}) }
}
const shape = (editor: Editor) => strip(editor.getJSON()).content

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] })

function caretIn(editor: Editor, text: string, offset = 0) {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) at = pos + node.text!.indexOf(text) + offset
  })
  editor.commands.setTextSelection(at)
}

function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection
    const insert = () => editor.state.tr.insertText(ch, from, to)
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))
    if (!handled) editor.view.dispatch(insert())
  }
}

function press(editor: Editor, key: string, mods: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods })
  editor.view.dom.dispatchEvent(event)
  return event
}

const toggleOf = (editor: Editor, i = 0) => {
  let found: { id: string; dom: HTMLElement } | null = null
  let n = 0
  editor.state.doc.descendants((node, pos) => {
    if (found || node.type.name !== "collapsible") return
    if (n++ === i) found = { id: node.attrs.blockId, dom: editor.view.nodeDOM(pos) as HTMLElement }
  })
  return found!
}

describe("an old toggle", () => {
  it("opens with its title as a rich first line, and its blocks after it", () => {
    const editor = docEditor('<div data-type="collapsible" data-title="Risks &amp; asks" data-open="false"><p>body</p><ul><li><p>item</p></li></ul></div>')
    expect(shape(editor)).toEqual([
      { type: "collapsible", content: [p("Risks & asks"), p("body"), { type: "bulletList", content: [{ type: "listItem", content: [p("item")] }] }] },
    ])
  })

  it("with an empty title, or none beside its data-open, keeps an empty first line, so nothing inside moves up into it", () => {
    const editor = docEditor('<div data-type="collapsible" data-title=""><p>body</p></div><div data-type="collapsible" data-open="true"><p>still body</p></div>')
    expect(shape(editor)).toEqual([
      { type: "collapsible", content: [{ type: "paragraph" }, p("body")] },
      { type: "collapsible", content: [{ type: "paragraph" }, p("still body")] },
    ])
  })

  it("written today reads back as written", () => {
    const editor = docEditor('<div data-type="collapsible"><h2>Plan</h2><p>step</p></div>')
    expect(shape(editor)).toEqual([{ type: "collapsible", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] }, p("step")] }])
    expect(editor.getHTML()).not.toMatch(/data-title|data-open/)
  })

  it("pasted as <details> from elsewhere is a toggle, its <summary> the first line", () => {
    const editor = docEditor("<details><summary>Why <strong>now</strong></summary><p>Because.</p></details>")
    expect(shape(editor)).toEqual([
      { type: "collapsible", content: [{ type: "paragraph", content: [{ type: "text", text: "Why " }, { type: "text", text: "now", marks: [{ type: "bold" }] }] }, p("Because.")] },
    ])
  })

  it("pasted as <details> with a heading in its <summary> is a toggle heading, and with no <summary> an empty first line", () => {
    const editor = docEditor("<details><summary><h3>Release notes</h3></summary><p>Shipped.</p></details><details><p>No summary.</p></details>")
    expect(shape(editor)).toEqual([
      { type: "collapsible", content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Release notes" }] }, p("Shipped.")] },
      { type: "collapsible", content: [{ type: "paragraph" }, p("No summary.")] },
    ])
  })
})

describe("making a toggle", () => {
  it("from a line, open for its writer, and into a toggle heading from Turn into", () => {
    const editor = docEditor("<p>Risks</p>")
    caretIn(editor, "Risks", 2)
    editor.commands.setToggle(0)
    expect(shape(editor)).toEqual([{ type: "collapsible", content: [p("Risks")] }])
    expect(isToggleOpen(toggleOf(editor).id)).toBe(true)
    expect(editor.state.selection.$from.parent.textContent).toBe("Risks")
    turnIntoFor(ALL_EDITIONS).find((t) => t.label === "Toggle heading 2")!.run(editor)
    expect(shape(editor)).toEqual([{ type: "collapsible", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Risks" }] }] }])
    expect(turnIntoFor(ALL_EDITIONS).filter((t) => t.isActive(editor)).map((t) => t.label)).toContain("Toggle heading 2")
  })

  it("with >> and a space, and a toggle heading with > in a heading (K7, K16); > alone is still a quote", () => {
    const editor = docEditor("<p></p>")
    editor.commands.setTextSelection(1)
    type(editor, ">> Scope")
    expect(shape(editor)).toEqual([{ type: "collapsible", content: [p("Scope")] }])
    const heading = docEditor("<h3>Later</h3>")
    heading.commands.setTextSelection(1)
    type(heading, "> ")
    expect(shape(heading)).toEqual([{ type: "collapsible", content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Later" }] }] }])
    const quote = docEditor("<p></p>")
    quote.commands.setTextSelection(1)
    type(quote, "> said")
    expect(shape(quote)?.[0].type).toBe("blockquote")
  })

  it("from /, as a toggle list or a toggle heading", async () => {
    const { slashItemsFor } = await import("@/components/docEditor/registry/readers")
    const titles = slashItemsFor("doc", ALL_EDITIONS).map((i) => i.title)
    expect(titles).toEqual(expect.arrayContaining(["Toggle list", "Toggle heading 1", "Toggle heading 2", "Toggle heading 3"]))
  })

  it("Turn into Text on its summary gives its lines back", () => {
    const editor = docEditor({ type: "doc", content: [{ type: "collapsible", content: [p("Summary"), p("inside")] }] })
    caretIn(editor, "Summary")
    turnIntoFor(ALL_EDITIONS).find((t) => t.label === "Text")!.run(editor)
    expect(shape(editor)).toEqual([p("Summary"), p("inside")])
  })
})

describe("open or closed", () => {
  it("is this viewer's own: closing writes nothing to the shared doc", () => {
    const provider = offlineProvider()
    const editor = docEditor("", { collaboration: { enabled: true, documentId: "d", username: "Sam" }, provider })
    editor.commands.setContent({ type: "doc", content: [{ type: "collapsible", content: [p("Summary"), p("inside")] }] })
    editor.commands.setTextSelection(3)
    let updates = 0
    provider.document.on("update", () => updates++)
    const before = JSON.stringify(editor.getJSON())
    const { id, dom } = toggleOf(editor)
    setTogglesOpen([id], false)
    expect(dom.getAttribute("data-open")).toBe("false")
    setTogglesOpen([id], true)
    expect(dom.getAttribute("data-open")).toBe("true")
    expect(JSON.stringify(editor.getJSON())).toBe(before)
    expect(updates, "a Yjs update would reach every other tab").toBe(0)
  })

  it("is closed for a viewer who never opened it, and remembered once they do", () => {
    const editor = docEditor({ type: "doc", content: [{ type: "collapsible", attrs: { blockId: "t-1" }, content: [p("Summary"), p("inside")] }] })
    const { dom } = toggleOf(editor)
    expect(dom.getAttribute("data-open")).toBe("false")
    ;(dom.querySelector(".toggle-chevron") as HTMLButtonElement).click()
    expect(dom.getAttribute("data-open")).toBe("true")
    expect(JSON.parse(localStorage.getItem("onecamp-doc-toggles")!)).toEqual([["t-1", true]])
  })

  it("flips with ⌘↩ (not inside a to-do), and every toggle with ⌘⌥T", () => {
    const editor = docEditor({
      type: "doc",
      content: [
        { type: "collapsible", attrs: { blockId: "a" }, content: [p("A"), p("a body")] },
        { type: "collapsible", attrs: { blockId: "b" }, content: [p("B"), p("b body")] },
      ],
    })
    caretIn(editor, "A", 1)
    expect(press(editor, "Enter", { ctrlKey: true }).defaultPrevented).toBe(true)
    expect(isToggleOpen("a")).toBe(true)
    press(editor, "t", { ctrlKey: true, altKey: true })
    expect([isToggleOpen("a"), isToggleOpen("b")]).toEqual([true, true])
    caretIn(editor, "a body", 2)
    press(editor, "t", { ctrlKey: true, altKey: true })
    expect([isToggleOpen("a"), isToggleOpen("b")]).toEqual([false, false])
    // The caret left the hidden text for the summary.
    expect(editor.state.selection.$from.parent.textContent).toBe("A")
  })

  it("opens around a position when find or a link asks (toggles.reveal), at once", () => {
    const editor = docEditor({
      type: "doc",
      content: [{ type: "collapsible", attrs: { blockId: "outer" }, content: [p("Outer"), { type: "collapsible", attrs: { blockId: "inner" }, content: [p("Inner"), p("needle")] }] }],
    })
    let pos = -1
    editor.state.doc.descendants((node, at) => {
      if (node.isText && node.text === "needle") pos = at
    })
    const reveal = actionById("toggles.reveal", { ai: false })!
    expect(reveal.surfaces).toEqual([])
    reveal.run({ docId: "d", editor, canEdit: false, bus: createDocCommandBus("d"), state: { pos } })
    expect([isToggleOpen("outer"), isToggleOpen("inner")]).toEqual([true, true])
    expect(toggleOf(editor, 1).dom.getAttribute("data-open")).toBe("true")
  })
})

describe("keys in and around a toggle", () => {
  it("↩ on an empty toggle makes it a line; on a closed one's summary, a new toggle after it", () => {
    const empty = docEditor({ type: "doc", content: [{ type: "collapsible", attrs: { blockId: "e" }, content: [{ type: "paragraph" }] }] })
    empty.commands.setTextSelection(2)
    press(empty, "Enter")
    expect(shape(empty)).toEqual([{ type: "paragraph" }])

    const closed = docEditor({ type: "doc", content: [{ type: "collapsible", attrs: { blockId: "c" }, content: [p("First half"), p("inside")] }] })
    caretIn(closed, "half", 0)
    press(closed, "Enter")
    expect(shape(closed)).toEqual([
      { type: "collapsible", content: [p("First "), p("inside")] },
      { type: "collapsible", content: [p("half")] },
    ])
  })

  it("↩ on the empty last line inside leaves the toggle", () => {
    const editor = docEditor({ type: "doc", content: [{ type: "collapsible", attrs: { blockId: "o" }, content: [p("Summary"), p("line"), { type: "paragraph" }] }] })
    setTogglesOpen(["o"], true)
    editor.commands.setTextSelection(editor.state.doc.content.size - 2)
    press(editor, "Enter")
    expect(shape(editor)).toEqual([{ type: "collapsible", content: [p("Summary"), p("line")] }, { type: "paragraph" }])
  })

  it("⌫ at the summary's start gives the lines back; ⌫ after a toggle joins its last line, never deleting it whole", () => {
    const start = docEditor({ type: "doc", content: [{ type: "collapsible", content: [p("Summary"), p("inside")] }] })
    caretIn(start, "Summary")
    press(start, "Backspace")
    expect(shape(start)).toEqual([p("Summary"), p("inside")])

    const after = docEditor({ type: "doc", content: [{ type: "collapsible", attrs: { blockId: "z" }, content: [p("Summary"), p("last")] }, p(" more")] })
    caretIn(after, " more")
    press(after, "Backspace")
    expect(shape(after)).toEqual([{ type: "collapsible", content: [p("Summary"), p("last more")] }])
    // It was closed: it opens here, so the line is seen where it went.
    expect(isToggleOpen("z")).toBe(true)
  })
})

describe("Turn into (N7)", () => {
  it("keeps a line inside a callout or a toggle", () => {
    const editor = docEditor({
      type: "doc",
      content: [
        { type: "callout", content: [p("in the callout"), p("second")] },
        { type: "collapsible", content: [p("Summary"), p("in the toggle")] },
      ],
    })
    const h2 = turnIntoFor(ALL_EDITIONS).find((t) => t.label === "Heading 2")!
    caretIn(editor, "in the callout")
    h2.run(editor)
    caretIn(editor, "in the toggle")
    h2.run(editor)
    const h = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] })
    expect(shape(editor)).toEqual([
      { type: "callout", attrs: { color: "blue", emoji: "💡" }, content: [h("in the callout"), p("second")] },
      { type: "collapsible", content: [p("Summary"), h("in the toggle")] },
    ])
  })

  it("makes a callout from a line, and ⌫ at its start gives the line back", () => {
    const editor = docEditor("<p>note this</p>")
    caretIn(editor, "note")
    turnIntoFor(ALL_EDITIONS).find((t) => t.label === "Callout")!.run(editor)
    expect(shape(editor)?.[0].type).toBe("callout")
    caretIn(editor, "note")
    press(editor, "Backspace")
    expect(shape(editor)).toEqual([p("note this")])
  })
})
