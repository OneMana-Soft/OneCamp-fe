import { afterEach, describe, expect, it } from "vitest"
import { Editor, type JSONContent } from "@tiptap/core"
import { StarterKit } from "@tiptap/starter-kit"
import { Link } from "./link"

// Read-only messages and docs are shown by this editor, and a click follows a
// link's href. These run the extension as the app does, on stored HTML and on
// content that reaches the editor without being parsed (a collaborator's edit,
// stored JSON).

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function editorWith(content: string | JSONContent, editable = false) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ history: false }), Link],
    content,
    editable,
  })
  editors.push(editor)
  return editor
}

function linksIn(editor: Editor) {
  return [...editor.view.dom.querySelectorAll("a")]
}

function linkMarks(editor: Editor) {
  const marks: { href: unknown }[] = []
  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) if (mark.type.name === "link") marks.push({ href: mark.attrs.href })
  })
  return marks
}

const UNSAFE = [
  "java&#x09;script:alert(1)",
  "java&#x0A;script:alert(1)",
  "java&#x0D;script:alert(1)",
  "java&Tab;script:alert(1)",
  "&#106;avascript:alert(1)",
  "javascript&colon;alert(1)",
  "JAVASCRIPT:alert(1)",
  " javascript:alert(1)",
  "vbscript:msgbox(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
]

describe("links in stored HTML", () => {
  it.each(UNSAFE)("keep the text of %s but not the link", (href) => {
    const editor = editorWith(`<p>Read <a href="${href}">the notes</a> now</p>`)
    expect(editor.getText()).toBe("Read the notes now")
    expect(linkMarks(editor)).toEqual([])
    expect(linksIn(editor)).toEqual([])
    expect(editor.getHTML()).not.toMatch(/script:|data:/i)
  })

  it.each([
    "https://example.com/a?b=1",
    "http://example.com",
    "mailto:sam@example.com",
    "tel:+442079460000",
    "/app/doc/d-1",
    "#notes",
  ])("still link to %s", (href) => {
    const editor = editorWith(`<p><a href="${href}">the notes</a></p>`)
    expect(linkMarks(editor)).toEqual([{ href }])
    const [a] = linksIn(editor)
    expect(a.getAttribute("href")).toBe(href)
    expect(a.textContent).toBe("the notes")
    expect(editor.getHTML()).toContain(`href="${href}"`)
  })

  it("still skips anchors that are buttons", () => {
    const editor = editorWith('<p><a data-type="button" href="https://example.com">Go</a></p>')
    expect(linkMarks(editor)).toEqual([])
  })
})

describe("links that reach the editor without being parsed", () => {
  const withMark = (href: string): JSONContent => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "the notes", marks: [{ type: "link", attrs: { href } }] }] }],
  })

  it.each(["javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "vbscript:msgbox(1)", "data:text/html,x"])(
    "render %j without an href",
    (href) => {
      const editor = editorWith(withMark(href))
      const [a] = linksIn(editor)
      expect(a).toBeDefined()
      expect(a.hasAttribute("href")).toBe(false)
      expect(a.textContent).toBe("the notes")
      expect(editor.getHTML()).not.toMatch(/script:|data:/i)
    },
  )

  it("render a safe href as it is", () => {
    const editor = editorWith(withMark("https://example.com/x"))
    expect(linksIn(editor)[0].getAttribute("href")).toBe("https://example.com/x")
  })
})

describe("making a link", () => {
  it("refuses an unsafe href and takes a safe one", () => {
    const editor = editorWith("<p>the notes</p>", true)
    editor.commands.setTextSelection({ from: 1, to: 10 })
    expect(editor.commands.setLink({ href: "java\tscript:alert(1)" })).toBe(false)
    expect(editor.commands.setLink({ href: "vbscript:msgbox(1)" })).toBe(false)
    expect(linkMarks(editor)).toEqual([])
    expect(editor.commands.setLink({ href: "https://example.com" })).toBe(true)
    expect(linkMarks(editor)[0]).toEqual({ href: "https://example.com" })
  })
})
