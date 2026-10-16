import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import type { EditorKind } from "@/components/docEditor/registry/types"

// MC-BUG-5: the chat composer's Enter sent from anywhere, so a list never got a
// second item, and a half-written code block was posted and pushed. In the
// composer, Enter in a list now makes the next item and in a code block the
// next line, Ctrl or Cmd with Enter always sends, and Enter sends otherwise.
// The rule is the composer's alone (blocks/behaviour.ts, by editor kind): a
// doc's Enter and Mod-Enter are as they were.

beforeAll(async () => {
  for (const kind of ["chat", "doc"] as const) await loadBlocks(kind, ALL_EDITIONS)
})

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
})

function editor(kind: EditorKind, content: string, onSubmit?: () => boolean) {
  const element = document.createElement("div")
  document.body.appendChild(element)
  const e = new Editor({ element, extensions: extensionsFor({ ...bareContext(kind, ALL_EDITIONS), onSubmitRef: { current: onSubmit } }), content })
  editors.push(e)
  e.commands.focus("end")
  return e
}

/** A key as the browser sends it; Ctrl is Mod off a Mac, as in jsdom. */
function press(e: Editor, key: string, ctrl = false) {
  e.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: ctrl, bubbles: true, cancelable: true }))
}

const items = (e: Editor) => (e.getJSON().content?.[0]?.content ?? []).filter((n) => n.type === "listItem").length

describe("the chat composer's Enter", () => {
  it("makes the next item in a list, and doesn't send", () => {
    const send = vi.fn(() => true)
    const e = editor("chat", "<ul><li><p>Ship the deck</p></li></ul>", send)
    press(e, "Enter")
    expect(items(e)).toBe(2)
    expect(send).not.toHaveBeenCalled()
  })

  it("leaves the list on an empty item, and then sends", () => {
    const send = vi.fn(() => true)
    const e = editor("chat", "<ul><li><p>Ship the deck</p></li></ul>", send)
    press(e, "Enter")
    press(e, "Enter")
    expect(items(e)).toBe(1)
    expect(e.getJSON().content?.at(-1)?.type).toBe("paragraph")
    expect(send).not.toHaveBeenCalled()
    press(e, "Enter")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("makes the next line in a code block, and doesn't send", () => {
    const send = vi.fn(() => true)
    const e = editor("chat", "<pre><code>const total = 1</code></pre>", send)
    press(e, "Enter")
    expect(e.getJSON().content).toHaveLength(1)
    expect(e.getJSON().content?.[0]?.type).toBe("codeBlock")
    expect(e.getText()).toBe("const total = 1\n")
    expect(send).not.toHaveBeenCalled()
  })

  it("sends from a paragraph, as before", () => {
    const send = vi.fn(() => true)
    const e = editor("chat", "<p>Looks good</p>", send)
    press(e, "Enter")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("sends with Ctrl or Cmd, from a list and from a code block", () => {
    const send = vi.fn(() => true)
    editor("chat", "<ul><li><p>Ship the deck</p></li></ul>", send)
    press(editors[0], "Enter", true)
    expect(send).toHaveBeenCalledTimes(1)
    const code = editor("chat", "<pre><code>const total = 1</code></pre>", send)
    press(code, "Enter", true)
    expect(send).toHaveBeenCalledTimes(2)
    expect(code.getText()).toBe("const total = 1")
  })
})

describe("a doc's Enter", () => {
  it("makes the next item in a list, as before", () => {
    const e = editor("doc", "<ul><li><p>Goals</p></li></ul>")
    press(e, "Enter")
    expect(items(e)).toBe(2)
  })

  it("makes the next line in a code block, as before", () => {
    const e = editor("doc", "<pre><code>const total = 1</code></pre>")
    press(e, "Enter")
    expect(e.getText()).toBe("const total = 1\n")
  })

  it("never sends with Ctrl or Cmd, whatever a host passes", () => {
    const send = vi.fn(() => true)
    const e = editor("doc", "<p>Plan</p>", send)
    press(e, "Enter", true)
    expect(send).not.toHaveBeenCalled()
  })
})
