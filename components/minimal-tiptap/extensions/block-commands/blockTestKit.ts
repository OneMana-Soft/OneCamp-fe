// Shared by B1's tests: a doc's editor as the registry builds it, and a few
// ways to read it. Not a test itself (no .test. in the name).

import { afterEach } from "vitest"
import { Editor, type JSONContent } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"

/** The doc's blocks, loaded as the app loads them. */
export const loadDocBlocks = () => loadBlocks("doc", ALL_EDITIONS)

/** A doc's editor holding this content (HTML or JSON), the caret at its end. */
export function docEditor(content: string | JSONContent): Editor {
  const editor = new Editor({ extensions: extensionsFor(bareContext("doc")), content })
  editor.commands.focus("end")
  made.push(editor)
  return editor
}

// Each test's editors go when it ends: a view left behind flushes its DOM
// observer after jsdom is gone, and the run reports an error.
const made: Editor[] = []
afterEach(() => {
  for (const e of made.splice(0)) if (!e.isDestroyed) e.destroy()
})

/** The top-level blocks as "type:text" (the text of each). */
export const outline = (doc: PMNode) => {
  const out: string[] = []
  doc.forEach((n) => out.push(`${n.type.name}:${n.textContent}`))
  return out
}

/** Each top-level block's text and its indent. */
export const indents = (doc: PMNode) => {
  const out: string[] = []
  doc.forEach((n) => out.push(`${n.textContent}@${n.attrs.indent ?? "-"}`))
  return out
}

/** Where the first block holding this text starts. */
export function posOf(doc: PMNode, text: string, type?: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (!node.isText && !node.isInline && node.textContent === text && (!type || node.type.name === type)) {
      found = pos
      return false
    }
    return true
  })
  if (found < 0) throw new Error(`no block reads "${text}"`)
  return found
}

/** A key on the editor, as the browser sends it ("Mod" is Ctrl: jsdom is not a Mac). */
export function press(editor: Editor, combo: string): KeyboardEvent {
  const parts = combo.split(/-(?!$)/)
  const key = parts.pop()!
  const mods = new Set(parts)
  const codes: Record<string, number> = { Tab: 9, Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, Delete: 46, "/": 191 }
  const upper = key.length === 1 ? key.toUpperCase() : key
  const event = new KeyboardEvent("keydown", {
    key,
    keyCode: codes[key] ?? upper.charCodeAt(0),
    ctrlKey: mods.has("Mod") || mods.has("Ctrl"),
    altKey: mods.has("Alt"),
    shiftKey: mods.has("Shift"),
    bubbles: true,
    cancelable: true,
  })
  editor.view.dom.dispatchEvent(event)
  return event
}
