import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { fireEvent } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { languageRows } from "@/components/docEditor/technical/LanguagePicker"
import { EXTRA_GRAMMARS } from "./grammars"
import { loadHighlighter } from "./lazyCodeBlock"
import { languageLabel, languageOf } from "./languages"

// A doc's code block (docs programme B3, editor.md P1-8): its language with a
// list behind it, Copy, Wrap and a caption, stored on the block; the chat
// composer's code block stays the plain one. Mermaid's diagram is the reader's
// own (only its source is stored).

// The highlighter and a grammar beyond the common set are chunks of their own,
// loaded when a code block first wants them. Loaded here with the blocks, so a
// test waits for the block's own steps and not for a module the test runner is
// still compiling, which in a full parallel run took past the waits below.
beforeAll(async () => {
  for (const kind of ["doc", "chat"] as const) await loadBlocks(kind, ALL_EDITIONS)
  await Promise.all([loadHighlighter(), EXTRA_GRAMMARS.elixir()])
}, 30_000)
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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function make(kind: "doc" | "chat", content: string) {
  const el = document.body.appendChild(document.createElement("div"))
  const editor = new Editor({ element: el, extensions: extensionsFor(bareContext(kind)), content })
  editors.push(editor)
  return editor
}

const block = (e: Editor) => e.getJSON().content![0]
const bar = (e: Editor, label: string) => e.view.dom.querySelector(`.doc-code-bar [aria-label="${label}"]`) as HTMLButtonElement

describe("a doc's code block", () => {
  it("keeps wrap and its caption through HTML, as data-wrap and data-caption", () => {
    const e = make("doc", '<pre data-wrap="true" data-caption="Says hi"><code class="language-go">fmt.Println(1)</code></pre>')
    expect(block(e).attrs).toEqual(expect.objectContaining({ language: "go", wrap: true, caption: "Says hi" }))
    expect(e.getHTML()).toMatch(/<pre[^>]*data-wrap="true"[^>]*data-caption="Says hi"|<pre[^>]*data-caption="Says hi"[^>]*data-wrap="true"/)
  })

  it("is the plain block in a chat message", () => {
    const e = make("chat", '<pre data-wrap="true" data-caption="x"><code>y</code></pre>')
    expect(block(e).attrs).not.toHaveProperty("wrap")
    expect(e.view.dom.querySelector(".doc-code-bar")).toBeNull()
  })

  it("says its language at its top left, as people name it", () => {
    const e = make("doc", '<pre><code class="language-golang">x</code></pre>')
    expect(e.view.dom.querySelector("button.doc-code-lang")?.textContent).toBe("Go")
    expect(languageLabel(null)).toBe("Auto")
    expect(languageOf("PY")?.id).toBe("python")
  })

  it("wraps its lines from the bar, and copies its text with a check for a moment", async () => {
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: write } })
    const e = make("doc", "<pre><code>line one</code></pre>")
    bar(e, "Wrap lines").click()
    expect(block(e).attrs?.wrap).toBe(true)
    expect(e.view.dom.querySelector(".doc-code")?.hasAttribute("data-wrap")).toBe(true)
    bar(e, "Copy code").click()
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith("line one"))
    await vi.waitFor(() => expect(bar(e, "Copied")).toBeTruthy())
  })

  it("takes a caption under it, stored when you press ↩", () => {
    const e = make("doc", "<pre><code>x</code></pre>")
    bar(e, "Add a caption").click()
    const input = e.view.dom.querySelector(".doc-code-caption input") as HTMLInputElement
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: "The deploy step" } })
    input.value = "The deploy step"
    fireEvent.keyDown(input, { key: "Enter" })
    expect(block(e).attrs?.caption).toBe("The deploy step")
  })

  it("shows a reader its language as words, with no list, Wrap or caption to add", () => {
    const ro = new Editor({
      element: document.body.appendChild(document.createElement("div")),
      extensions: extensionsFor(bareContext("doc")),
      content: '<pre><code class="language-go">x</code></pre>',
      editable: false,
    })
    editors.push(ro)
    expect((ro.view.dom.querySelector("button.doc-code-lang") as HTMLElement).hidden).toBe(true)
    expect((ro.view.dom.querySelector("span.doc-code-lang") as HTMLElement).textContent).toBe("Go")
    expect((ro.view.dom.querySelector('[aria-label="Wrap lines"]') as HTMLElement).hidden).toBe(true)
    expect((ro.view.dom.querySelector('[aria-label="Copy code"]') as HTMLElement).hidden).toBe(false)
  })

  it("draws a Mermaid block's diagram, the view the reader's own", async () => {
    vi.doMock("./mermaid", () => ({ renderMermaid: async (src: string) => ({ svg: `<svg data-src="${src.length}"></svg>` }) }))
    // The stand-in is loaded before the block asks for it, and the block's
    // 300 ms pause before drawing runs on the test's clock: the wait is for
    // the drawing alone. With the module still to load and the pause on the
    // machine's clock, a full parallel run waited past 1 s.
    await import("./mermaid")
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const e = make("doc", '<pre><code class="language-mermaid">graph TD;A--&gt;B</code></pre>')
    const view = e.view.dom.querySelector(".doc-code") as HTMLElement
    expect(view.dataset.mode).toBe("preview")
    await vi.advanceTimersByTimeAsync(300)
    vi.useRealTimers()
    await vi.waitFor(() => expect(view.querySelector(".doc-code-diagram svg")).toBeTruthy())
    ;(view.querySelector('.doc-code-mode[data-mode="code"]') as HTMLButtonElement).click()
    expect(view.dataset.mode).toBe("code")
    // Nothing about the view went into the doc (I5).
    expect(JSON.stringify(e.getJSON())).not.toMatch(/"(preview|split|mode)"/)
    vi.doUnmock("./mermaid")
  })
})

describe("the language list", () => {
  it("puts the languages used last first, then finds by name, id or alias", () => {
    const rows = languageRows("", "go", ["python"])
    expect(rows[0]).toEqual(expect.objectContaining({ id: "r-python", group: "Recent" }))
    expect(languageRows("golang", null).map((r) => r.id)[0]).toBe("go")
    expect(languageRows("ts", null).map((r) => r.id)).toContain("typescript")
    expect(languageRows("zzzz", null)).toEqual([])
  })
})

describe("highlighting", () => {
  it("loads with the first code block, and a grammar beyond the common set when a block names it", async () => {
    const h = await loadHighlighter()
    const e = make("doc", '<pre><code class="language-go">func main() {}</code></pre><pre><code class="language-elixir">defmodule A do end</code></pre>')
    await vi.waitFor(() => expect(e.view.dom.querySelector("pre code .hljs-keyword")).toBeTruthy())
    await vi.waitFor(() => expect(e.view.dom.querySelectorAll("pre code .hljs-keyword").length).toBeGreaterThan(1), { timeout: 5000 })
    expect(h.hasWanted()).toBe(false)
  })

  it("keeps every block's colours when collaboration replaces the whole doc, and colours again the block that changed", async () => {
    await loadHighlighter()
    const e = make("doc", '<pre><code class="language-go">func main() {}</code></pre><p>between</p><pre><code class="language-go">func other() {}</code></pre>')
    const coloured = () => Array.from(e.view.dom.querySelectorAll("pre")).map((pre) => pre.querySelectorAll('[class*="hljs-"]').length)
    const whole = (content: import("@tiptap/pm/model").Fragment) => e.view.dispatch(e.state.tr.replaceWith(0, e.state.doc.content.size, content))
    // The blocks get their ids on the doc's first change; then they are as a shared doc's are.
    whole(e.state.doc.content)
    await vi.waitFor(() => expect(coloured().every((n) => n > 0)).toBe(true))
    const before = coloured()
    const at = (test: (n: import("@tiptap/pm/model").Node) => boolean) => {
      let found = -1
      e.state.doc.content.forEach((n, _, i) => void (found < 0 && test(n) && (found = i)))
      return found
    }

    // Binding anew, y-prosemirror draws the doc again from its own copy.
    whole(e.schema.nodeFromJSON(e.state.doc.toJSON()).content)
    expect(coloured()).toEqual(before)
    // Another person's change arrives as the whole doc replaced.
    whole(e.state.doc.content.replaceChild(at((n) => n.type.name === "paragraph"), e.schema.nodes.paragraph.create(null, e.schema.text("changed by someone"))))
    expect(coloured()).toEqual(before)
    const second = at((n) => n.textContent.startsWith("func other"))
    const code = e.state.doc.child(second)
    whole(e.state.doc.content.replaceChild(second, code.type.create(code.attrs, e.schema.text("func other() { return }"))))
    expect(coloured()[0]).toBe(before[0])
    expect(coloured()[1]).toBeGreaterThan(before[1])
  })
})
