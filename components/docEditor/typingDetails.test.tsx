import * as React from "react"
import { readFileSync } from "node:fs"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { loadBlocks } from "@/components/docEditor/registry/factory"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { EditorContent, type Editor } from "@tiptap/react"
import { Slice } from "@tiptap/pm/model"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { useDocEditor } from "./useDocEditor"
import { offlineProvider } from "./docTestKit"
import { loadClipboardWriter } from "@/components/minimal-tiptap/extensions/clipboard-markdown/clipboardMarkdown"
import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { TooltipProvider } from "@/components/ui/tooltip"

// The doc's own blocks load once, as the app loads them, before any doc editor is built.
beforeAll(() => loadBlocks("doc", { ai: true }), 30_000)

// Small things a Notion user notices in the first minute (small-details.md):
// T12 Enter after bold text in a list, T13 the empty <span> every Enter left,
// L17 what a copy pastes as text, T8 a click below the content, T10 the
// caret beside a divider.

vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/doc/d" }))

let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
const providers: HocuspocusProvider[] = []
afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
  document.body.innerHTML = ""
})

async function docEditor(html: string) {
  const provider = offlineProvider()
  providers.push(provider)
  let editor: Editor | null = null
  function Doc() {
    const e = useDocEditor({
      collaboration: { enabled: true, documentId: "d", username: "Sam Rivera", userId: "u-sam", hue: "moss" },
      provider,
    })
    editor = e as unknown as Editor | null
    return e ? <EditorContent editor={e} className="minimal-tiptap-editor doc-editor" /> : null
  }
  render(
    <Provider store={store}>
      <MediaQueryProvider>
        <TooltipProvider>
          <Doc />
        </TooltipProvider>
      </MediaQueryProvider>
    </Provider>,
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  await act(async () => {
    editor!.commands.setContent(html)
    editor!.commands.focus("end")
  })
  return editor!
}

function press(editor: Editor, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode: key === "Enter" ? 13 : 0, bubbles: true, cancelable: true, ...init }))
  })
}

async function type(editor: Editor, text: string) {
  await act(async () => {
    for (const ch of text) {
      const { from, to } = editor.state.selection
      const insert = () => editor.state.tr.insertText(ch, from, to)
      const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, ch, insert))
      if (!handled) editor.view.dispatch(insert())
    }
  })
}

describe("Enter after bold, italic, strike, underline or code in a list (T12)", () => {
  it("makes a new item, not a second line in the same one, and leaves the mark behind", async () => {
    const editor = await docEditor("<ul><li><p>plain <strong>bold</strong></p></li></ul>")
    press(editor, "Enter")
    await type(editor, "next")
    const list = editor.getJSON().content?.[0]
    expect(list?.type).toBe("bulletList")
    expect(list?.content).toHaveLength(2)
    expect(list?.content?.[0].content).toHaveLength(1)
    expect(JSON.stringify(list?.content?.[1])).toContain('"text":"next"')
    expect(JSON.stringify(list?.content?.[1])).not.toContain("bold")
  })
})

describe("Enter and the text colour (T13)", () => {
  it("leaves no empty <span> on the new line", async () => {
    const editor = await docEditor("<p>first</p>")
    press(editor, "Enter")
    await type(editor, "second")
    expect(editor.getHTML()).not.toContain("<span")
  })

  it("leaves a colour behind on the new line, still without an empty span", async () => {
    const editor = await docEditor("<p>first</p>")
    act(() => {
      editor.chain().setColor("var(--camp-sky-ink)").run()
    })
    await type(editor, " sky")
    press(editor, "Enter")
    await type(editor, "plain")
    const second = editor.getHTML().split("</p>")[1]
    expect(second).toContain("plain")
    expect(second).not.toContain("<span")
  })
})

describe("copying out of a doc (L17)", () => {
  // The Markdown writer loads on idle or at the first selection (clipboardMarkdown.ts).
  beforeAll(() => loadClipboardWriter())

  const md = (editor: Editor, from: number, to: number) => {
    const slice: Slice = editor.state.doc.slice(from, to)
    return editor.view.someProp("clipboardTextSerializer", (f) => f(slice, editor.view)) as string
  }

  it("pastes as clean Markdown: one blank line between blocks, markers, boxes and addresses kept", async () => {
    const editor = await docEditor(
      '<h2>Plan</h2><p>Read <a href="https://example.com/brief">the brief</a> first, <strong>then</strong> decide.</p>' +
        "<ul><li><p>one</p></li><li><p>two</p><ul><li><p>two and a half</p></li></ul></li></ul>" +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li><li data-type="taskItem" data-checked="false"><p>open</p></li></ul>' +
        '<pre><code class="language-go">fmt.Println("hi")</code></pre><hr><blockquote><p>quoted</p></blockquote>',
    )
    expect(md(editor, 0, editor.state.doc.content.size)).toBe(
      [
        "## Plan",
        "Read [the brief](https://example.com/brief) first, **then** decide.",
        "- one\n- two\n  - two and a half",
        // Straight after a "-" list, so it takes "*": with "-" Markdown reads the two as one list.
        "* [x] done\n* [ ] open",
        '```go\nfmt.Println("hi")\n```',
        "---",
        "> quoted",
      ].join("\n\n"),
    )
  })

  it("copies a phrase from inside a bullet as the phrase alone", async () => {
    const editor = await docEditor("<ul><li><p>the launch date moves</p></li></ul>")
    const from = 1 + 1 + 1 + 4 // into the list, the item, the paragraph, past "the "
    expect(md(editor, from, from + 6)).toBe("launch")
  })
})

describe("a click below the content (T8)", () => {
  const clickBelow = (editor: Editor) =>
    act(() => {
      fireEvent.mouseDown(editor.view.dom, { button: 0, clientY: 900 })
    })

  it("in an empty doc, puts the caret in its one line and adds none", async () => {
    const editor = await docEditor("<p></p>")
    clickBelow(editor)
    expect(editor.getJSON().content).toHaveLength(1)
    expect(editor.state.selection.from).toBe(1)
  })

  it("after text, moves the caret to its end and adds nothing", async () => {
    const editor = await docEditor("<h2>Plan</h2><p>Ship it</p>")
    act(() => {
      editor.commands.setTextSelection(2)
    })
    clickBelow(editor)
    expect(editor.getJSON().content).toHaveLength(2)
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1)
  })

  it("after a divider, adds one line for the caret, and a second click adds none", async () => {
    const editor = await docEditor("<p>above</p><hr>")
    clickBelow(editor)
    expect(editor.getJSON().content?.map((n) => n.type)).toEqual(["paragraph", "horizontalRule", "paragraph"])
    clickBelow(editor)
    expect(editor.getJSON().content).toHaveLength(3)
  })
})

describe("this person's colour, to everyone else", () => {
  it("goes out in their awareness state, for their caret and face on other screens", async () => {
    await docEditor("<p>hi</p>")
    const provider = providers[providers.length - 1]
    expect(provider.awareness?.getLocalState()?.user).toEqual(expect.objectContaining({ name: "Sam Rivera", hue: "moss" }))
  })
})

describe("Tab in a code block (T24)", () => {
  const code = (editor: Editor) => editor.state.doc.firstChild!.textContent

  it("indents by two spaces, and Shift+Tab takes them back, with focus kept in the code", async () => {
    const editor = await docEditor('<pre><code>if (x) {\nreturn\n}</code></pre>')
    // The caret at the start of "return".
    act(() => {
      editor.commands.setTextSelection(1 + "if (x) {\n".length)
    })
    const tab = new KeyboardEvent("keydown", { key: "Tab", keyCode: 9, bubbles: true, cancelable: true })
    act(() => {
      editor.view.dom.dispatchEvent(tab)
    })
    expect(tab.defaultPrevented).toBe(true)
    expect(code(editor)).toBe("if (x) {\n  return\n}")
    press(editor, "Tab", { shiftKey: true, keyCode: 9 })
    expect(code(editor)).toBe("if (x) {\nreturn\n}")
  })

  it("indents every line selected", async () => {
    const editor = await docEditor("<pre><code>a\nb\nc</code></pre>")
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 1 + "a\nb\nc".length })
    })
    press(editor, "Tab", { keyCode: 9 })
    expect(code(editor)).toBe("  a\n  b\n  c")
  })
})

describe("the caret beside a divider or an image (T10)", () => {
  it("is drawn while the editor has focus, as a brand line, instead of display: none for good", () => {
    const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
    expect(css).not.toMatch(/\.ProseMirror-gapcursor\s*\{\s*@apply[^}]*hidden/)
    expect(css).toMatch(/\.ProseMirror\.ProseMirror-focused \.ProseMirror-gapcursor\s*\{\s*display: block;/)
    expect(css).toMatch(/\.ProseMirror-gapcursor::after\s*\{[^}]*border-top: 2px solid var\(--brand\)/)
  })
})
