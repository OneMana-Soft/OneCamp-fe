import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import "@/components/docEditor/registry"
import "@/components/minimal-tiptap/extensions/formatting/register"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { slashItemsFor } from "@/components/docEditor/registry/readers"
import { slashScore } from "../slash-command/slashCommand"
import { reapplyLastColour } from "./blockColor"
import { LEGACY_LAST_KEY, blockColourValue, colourTargets, pickOf, pickValue, recentColours, rememberColour } from "./colourPicks"

// Colour in a doc (B2; editor.md P1-2, N15): text colours and highlights on
// selected text, a block's own colour otherwise, all stored by name.

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
  localStorage.clear()
})

function docEditor(content: string) {
  const editor = new Editor({ extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  return editor
}

/** The HTML without block ids, which the editor gives every block. */
const html = (editor: Editor) => editor.getHTML().replace(/ data-block-id="[^"]*"/g, "")

const caretIn = (editor: Editor, text: string) => {
  let at = -1
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text)) at = pos + node.text!.indexOf(text) + 1
  })
  editor.commands.setTextSelection(at)
}

const selectText = (editor: Editor, text: string) => {
  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (!range && node.isText && node.text!.includes(text)) {
      const from = pos + node.text!.indexOf(text)
      range = { from, to: from + text.length }
    }
  })
  editor.commands.setTextSelection(range!)
}

/** Typed, as the browser hands it to the editor (input rules run). */
function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection
    const insert = () => editor.state.tr.insertText(ch, from, to)
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))
    if (!handled) editor.view.dispatch(insert())
  }
}

describe("text colour", () => {
  it("is stored by name, as data-color", () => {
    const editor = docEditor("<p>ship it</p>")
    selectText(editor, "ship")
    editor.commands.setColor("sky")
    expect(html(editor)).toBe('<p class="text-node"><span data-color="sky">ship</span> it</p>')
  })

  it("reads an old doc's CSS variable as its name, and drops colours that aren't ours", () => {
    const editor = docEditor('<p><span style="color: var(--camp-sky-ink)">blue</span> and <span style="color: rgb(0, 0, 0)">black</span></p>')
    expect(html(editor)).toBe('<p class="text-node"><span data-color="sky">blue</span> and black</p>')
  })

  it("stores the name when a CSS variable is given (the old selection bar's buttons)", () => {
    const editor = docEditor("<p>moss</p>")
    selectText(editor, "moss")
    editor.commands.setColor("var(--camp-moss-ink)")
    expect(html(editor)).toContain('<span data-color="moss">moss</span>')
    editor.commands.setColor("#ff0000")
    expect(html(editor)).toBe('<p class="text-node">moss</p>')
  })
})

describe("highlights", () => {
  it("are a mark by name, yellow when none is named", () => {
    const editor = docEditor("<p>mark this <mark>and this</mark></p>")
    expect(html(editor)).toContain('<mark data-color="sun">and this</mark>')
    selectText(editor, "mark this")
    editor.commands.setHighlight("sky")
    expect(html(editor)).toContain('<mark data-color="sky">mark this</mark>')
    editor.commands.unsetHighlight()
    expect(html(editor)).not.toContain('data-color="sky"')
  })

  it("come from ==text== as it is typed (K13)", () => {
    const editor = docEditor("<p></p>")
    editor.commands.setTextSelection(1)
    type(editor, "the ==key point== here")
    expect(html(editor)).toBe('<p class="text-node">the <mark data-color="sun">key point</mark> here</p>')
  })

  it("leave == with spaces inside, and code, alone", () => {
    const editor = docEditor("<p></p>")
    editor.commands.setTextSelection(1)
    type(editor, "a == b == c")
    expect(html(editor)).not.toContain("<mark")
  })
})

describe("a block's own colour", () => {
  it("goes on the caret's block when nothing is selected, as Notion's API stores it", () => {
    const editor = docEditor("<p>one</p><p>two</p>")
    caretIn(editor, "two")
    editor.commands.applyColour({ colour: "sky", background: true })
    expect(html(editor)).toBe('<p class="text-node">one</p><p class="text-node" data-block-color="sky_background">two</p>')
    editor.commands.applyColour({ colour: "berry", background: false })
    expect(html(editor)).toContain('data-block-color="berry"')
  })

  it("takes off only its own row's colour with Default", () => {
    const editor = docEditor('<p data-block-color="sky_background">two</p>')
    caretIn(editor, "two")
    editor.commands.applyColour({ colour: null, background: false })
    expect(html(editor)).toContain('data-block-color="sky_background"')
    editor.commands.applyColour({ colour: null, background: true })
    expect(html(editor)).not.toContain("data-block-color")
  })

  it("colours a list item from its first line, and a quote from any of its lines", () => {
    const editor = docEditor("<ul><li><p>a bullet</p></li></ul><blockquote><p>first</p><p>second</p></blockquote>")
    caretIn(editor, "bullet")
    editor.commands.applyColour({ colour: "moss", background: false })
    caretIn(editor, "second")
    editor.commands.applyColour({ colour: "dusk", background: true })
    expect(html(editor)).toContain('<li data-block-color="moss">')
    expect(html(editor)).toContain('<blockquote class="block-node" data-block-color="dusk_background">')
  })

  it("colours the outermost blocks in the block menu's range", () => {
    const editor = docEditor("<p>before</p><ul><li><p>b</p></li><li><p>c</p></li></ul><p>after</p>")
    const list = editor.state.doc.child(1)
    const from = editor.state.doc.child(0).nodeSize
    editor.commands.applyColour({ colour: "sun", background: true }, { from, to: from + list.nodeSize })
    const out = html(editor)
    expect(out.match(/data-block-color="sun_background"/g)).toHaveLength(2)
    expect(out).toContain('<p class="text-node">before</p>')
    expect(out).toContain('<p class="text-node">after</p>')
    expect(colourTargets(editor.state, { from, to: from + list.nodeSize }).map((t) => t.node.type.name)).toEqual(["listItem", "listItem"])
  })

  it("colours only the block menu's chosen blocks, never what lies between them (B1's ids)", () => {
    const editor = docEditor('<p data-block-id="a">one</p><p data-block-id="b">two</p><ul data-block-id="c"><li data-block-id="d"><p>three</p></li></ul>')
    const all = { from: 0, to: editor.state.doc.content.size }
    expect(colourTargets(editor.state, all, ["a", "c"]).map((t) => t.node.attrs.blockId)).toEqual(["a", "d"])
    editor.commands.applyColour({ colour: "moss", background: false }, all, ["a", "c"])
    const colours: unknown[] = []
    editor.state.doc.descendants((n) => {
      if (n.attrs.blockId) colours.push([n.attrs.blockId, n.attrs.blockColor ?? null])
    })
    expect(colours).toEqual([["a", "moss"], ["b", null], ["c", null], ["d", "moss"]])
  })

  it("colours selected text, not its block", () => {
    const editor = docEditor("<p>a word here</p>")
    selectText(editor, "word")
    editor.commands.applyColour({ colour: "berry", background: false })
    editor.commands.applyColour({ colour: "sky", background: true })
    expect(html(editor)).toBe('<p class="text-node">a <span data-color="berry"><mark data-color="sky">word</mark></span> here</p>')
  })

  it("leaves a new line after a coloured one plain", () => {
    const editor = docEditor('<p data-block-color="sky">one</p>')
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.splitBlock()
    expect(editor.state.doc.child(1).attrs.blockColor).toBeNull()
  })

  it("reads only our values", () => {
    const editor = docEditor('<p data-block-color="sky">a</p><p data-block-color="red">b</p><p data-block-color="sky_bg">c</p>')
    expect([0, 1, 2].map((i) => editor.state.doc.child(i).attrs.blockColor)).toEqual(["sky", null, null])
    expect(blockColourValue("gray_background")).toBe("gray_background")
    expect(pickOf("berry_background")).toEqual({ colour: "berry", background: true })
    expect(pickValue({ colour: null, background: true })).toBeNull()
  })

  it("is drawn on a to-do, whose own view keeps no attribute", () => {
    const editor = docEditor('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>todo</p></li></ul>')
    caretIn(editor, "todo")
    editor.commands.applyColour({ colour: "lake", background: true })
    const li = () => editor.view.dom.querySelector("li.task-item")
    expect(li()?.getAttribute("data-block-color")).toBe("lake_background")
    editor.commands.applyColour({ colour: null, background: true })
    expect(li()?.hasAttribute("data-block-color")).toBe(false)
  })
})

describe("the last colour used", () => {
  it("comes back with ⌘⇧H, on the selection or the caret's block", () => {
    const editor = docEditor("<p>first</p><p>second</p>")
    rememberColour({ colour: "dusk", background: false })
    selectText(editor, "first")
    expect(reapplyLastColour(editor)).toBe(true)
    expect(html(editor)).toContain('<span data-color="dusk">first</span>')
    caretIn(editor, "second")
    const key = new KeyboardEvent("keydown", { key: "h", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    editor.view.dom.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(true)
    expect(editor.state.doc.child(1).attrs.blockColor).toBe("dusk")
  })

  it("keeps the three newest, newest first", () => {
    for (const colour of ["sky", "moss", "sun", "berry"] as const) rememberColour({ colour, background: colour === "sun" })
    rememberColour({ colour: null, background: false })
    expect(recentColours().map(pickValue)).toEqual(["berry", "sun_background", "moss"])
  })

  it("takes over the old selection bar's colour once, and lets its key go", () => {
    rememberColour({ colour: "sky", background: true })
    localStorage.setItem(LEGACY_LAST_KEY, "var(--camp-moss-ink)")
    expect(recentColours().map(pickValue)).toEqual(["moss", "sky_background"])
    expect(localStorage.getItem(LEGACY_LAST_KEY)).toBeNull()
  })
})

describe('"/" colours', () => {
  const items = () => slashItemsFor("doc", ALL_EDITIONS).filter((i) => i.section === "Colour")
  const best = (q: string) => [...items()].sort((a, b) => slashScore(b, q) - slashScore(a, q))[0]?.title

  it("offers each colour for text and for a background, each led by Default", () => {
    expect(items().map((i) => i.title)).toEqual([
      "Default colour", "Grey", "Yellow", "Green", "Teal", "Blue", "Purple", "Red",
      "Default background", "Grey background", "Yellow background", "Green background", "Teal background", "Blue background", "Purple background", "Red background",
    ])
  })

  it("finds them by the words people use and by the camp names", () => {
    expect(best("red")).toBe("Red")
    expect(best("sky background")).toBe("Blue background")
    expect(best("grey")).toBe("Grey")
    expect(best("gray")).toBe("Grey")
    expect(best("berry")).toBe("Red")
  })

  it("colours the line it was typed on", () => {
    const editor = docEditor("<p>status</p>")
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    type(editor, " /red")
    const at = editor.state.selection.from
    items().find((i) => i.title === "Red background")!.command({ editor: editor as never, range: { from: at - 4, to: at } })
    expect(html(editor)).toBe('<p class="text-node" data-block-color="berry_background">status </p>')
    expect(editor.state.selection).toBeInstanceOf(TextSelection)
  })
})
