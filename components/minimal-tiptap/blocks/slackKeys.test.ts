import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { shortcutDialogGroups, shortcutRowsFor } from "@/components/docEditor/registry/shortcuts"
import type { EditorKind } from "@/components/docEditor/registry/types"

// MC-4: Slack's formatting keys did nothing in a message box, or something
// else. They work there now beside ours, through the shortcut table: ⌘⇧X
// strikes through, ⌘⇧9 quotes, ⌘⌥⇧C and ⌘⌥8 make a code block. A doc keeps
// Notion's keys: ⌘⇧9 is its to-do list, and ⌘⇧X does nothing there.

beforeAll(async () => {
  // jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
    Range.prototype.getBoundingClientRect = () => new DOMRect()
  }
  for (const kind of ["chat", "doc"] as const) await loadBlocks(kind, ALL_EDITIONS)
})

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
})

function editor(kind: EditorKind, content: string) {
  const element = document.createElement("div")
  document.body.appendChild(element)
  const e = new Editor({ element, extensions: extensionsFor(bareContext(kind, ALL_EDITIONS)), content })
  editors.push(e)
  e.commands.focus()
  e.commands.selectAll()
  return e
}

/** A chord as a browser sends it, in Tiptap's notation ("Mod" is Ctrl: jsdom is not a Mac). */
function press(e: Editor, chord: string) {
  const parts = chord.split("-")
  const key = parts.pop()!
  const mods = new Set(parts)
  const event = new KeyboardEvent("keydown", {
    key: mods.has("Shift") && key.length === 1 ? key.toUpperCase() : key,
    keyCode: key.toUpperCase().charCodeAt(0),
    ctrlKey: mods.has("Mod"),
    altKey: mods.has("Alt"),
    shiftKey: mods.has("Shift"),
    bubbles: true,
    cancelable: true,
  })
  e.view.dom.dispatchEvent(event)
  return event.defaultPrevented
}

describe("Slack's keys in a message box", () => {
  it("strike through, quote and make a code block, beside ours", () => {
    for (const [chord, made] of [
      ["Mod-Shift-x", "<s>"],
      ["Mod-Shift-s", "<s>"],
      ["Mod-Shift-9", "<blockquote"],
      ["Mod-Shift-b", "<blockquote"],
      ["Mod-Alt-Shift-c", "<pre"],
      ["Mod-Alt-8", "<pre"],
    ] as const) {
      const e = editor("chat", "<p>ship it</p>")
      expect(press(e, chord), chord).toBe(true)
      expect(e.getHTML(), chord).toContain(made)
    }
  })

  it("are the composer's alone: a doc keeps Notion's", () => {
    const e = editor("doc", "<p>ship it</p>")
    expect(press(e, "Mod-Shift-x")).toBe(false)
    expect(e.getHTML()).not.toContain("<s>")
    const doc = shortcutRowsFor("doc", ALL_EDITIONS)
    const chords = doc.flatMap((r) => (r.keys ? [r.keys, ...(r.alt ?? [])] : []))
    expect(chords).not.toContain("Mod-Shift-x")
    expect(chords).not.toContain("Mod-Alt-Shift-c")
    expect(doc.find((r) => r.keys === "Mod-Alt-4")?.alt).toContain("Mod-Shift-9")
  })

  it("leave ⌘⇧C to the browser, which opens its inspector on it", () => {
    const rows = shortcutRowsFor("chat", ALL_EDITIONS)
    expect(rows.some((r) => r.keys === "Mod-Shift-c")).toBe(false)
  })

  it("are the only keys the table binds in a message box or a task", () => {
    const bound = (kind: EditorKind) => shortcutRowsFor(kind, ALL_EDITIONS).filter((r) => r.run).map((r) => r.keys)
    expect(bound("chat")).toEqual(["Mod-Shift-x", "Mod-Shift-9", "Mod-Alt-Shift-c"])
    expect(bound("task")).toEqual([])
  })

  it("are more ways on the row they share a name with, never a second row (the shortcut list)", () => {
    const groups = shortcutDialogGroups(shortcutRowsFor("chat", ALL_EDITIONS))
    for (const g of groups) {
      const labels = g.rows.map((r) => r.label)
      expect(labels, g.title).toEqual([...new Set(labels)])
    }
    const ways = (label: string) => groups.flatMap((g) => g.rows).find((r) => r.label === label)!.ways.map((w) => w.join(""))
    expect(ways("Strikethrough")).toEqual(["⌘⇧S", "⌘⇧X"])
    expect(ways("Quote")).toEqual(["⌘⇧B", "⌘⇧9", '"'])
    expect(ways("Code block")).toEqual(expect.arrayContaining(["⌘⌥8", "⌘⌥⇧C", "```"]))
    expect(ways("Code block")).toHaveLength(3)
  })
})
