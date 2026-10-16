import * as React from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

// An empty doc's starter (docs programme B5): three templates, More
// templates and a file to start from, as rows of one list under the first
// line, with B9's draft after them. A template is the server's to write into
// the live copy (N37); a file is put in as the person's own edit, only while
// the doc is still blank.

const applyTemplate = vi.fn()
vi.mock("@/services/docHomeService", async (importOriginal) => ({ ...(await importOriginal<object>()), applyTemplate: (d: string, t: string) => applyTemplate(d, t) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<object>()), toast: (t: unknown) => toast(t) }))

import "@/components/docTemplates/register"
import { actionById, slotFor } from "@/components/docEditor/registry/registry"
import { actionGroupsFor, editorActionContext } from "@/components/docEditor/registry/readers"
import { StarterImport, StarterTemplates } from "./EmptyDocStarter"
import { QUICK_DOC_TEMPLATES } from "@/lib/docTemplates"

// jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret
// into view (lib/testing/rangeRects).
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  while (editors.length) editors.pop()!.destroy()
  applyTemplate.mockReset()
  toast.mockReset()
})

/** A doc's editor in the page, the starter beside it as DocBodyLayer draws it. */
function setup(html = "<p></p>") {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const mount = document.createElement("div")
  host.appendChild(mount)
  const editor = new Editor({ element: mount, extensions: [StarterKit], content: html })
  editors.push(editor)
  const starter = document.createElement("div")
  starter.setAttribute("data-doc-empty-starter", "")
  host.appendChild(starter)
  render(
    <>
      <StarterTemplates docId="doc-1" editor={editor} />
      <StarterImport docId="doc-1" editor={editor} />
    </>,
    { container: starter },
  )
  return editor
}

describe("the empty starter's place in the doc", () => {
  it("is two rows of the empty doc's slot: templates at 10 and a file at 15, before Doc AI's draft at 20", () => {
    const mine = slotFor("emptyStarter", { ai: true }).filter((c) => c.id === "templates" || c.id === "import")
    expect(mine.map((c) => [c.id, c.order])).toEqual([
      ["templates", 10],
      ["import", 15],
    ])
    expect(mine.every((c) => c.edition === "both")).toBe(true)
  })

  it("puts Save as template in More, the palette and the phone's sheet, only for a doc with something in it", () => {
    const action = actionById("doc.saveAsTemplate", { ai: false })!
    expect(action.surfaces).toEqual(["more", "palette", "phoneSheet"])
    const empty = new Editor({ extensions: [StarterKit], content: "<p></p>" })
    const full = new Editor({ extensions: [StarterKit], content: "<p>Agenda</p>" })
    editors.push(empty, full)
    const ctx = (editor: Editor | null) => ({ docId: "d", editor, canEdit: true, bus: { docId: "d", key: "k", emit: vi.fn(), on: () => () => {} } })
    expect(action.isEnabled!(ctx(empty))).toBe(false)
    expect(action.isEnabled!(ctx(null))).toBe(false)
    expect(action.isEnabled!(ctx(full))).toBe(true)
  })

  // A template's preview is shown to every member, so someone who may only
  // read a private doc must never be offered to publish it (the server
  // refuses them too).
  it("leaves Save as template out of every surface when the doc can't be edited", () => {
    const readOnly = new Editor({ extensions: [StarterKit], content: "<p>Salary bands</p>", editable: false })
    const editable = new Editor({ extensions: [StarterKit], content: "<p>Salary bands</p>" })
    editors.push(readOnly, editable)
    type Surface = "more" | "palette" | "phoneSheet"
    const shownIn = (surface: Surface, ctx: ReturnType<typeof editorActionContext>) =>
      actionGroupsFor(surface, ctx, [], { disabled: "show" })
        .flatMap((g) => g.actions)
        .some((a) => a.action.id === "doc.saveAsTemplate")
    const shown = (editor: Editor, surface: Surface) => shownIn(surface, editorActionContext(editor, { ai: false }))
    for (const surface of ["more", "palette", "phoneSheet"] as const) {
      expect(shown(readOnly, surface)).toBe(false)
      expect(shown(editable, surface)).toBe(true)
      // A host that knows the person may only read says so, whatever the editor is.
      expect(shownIn(surface, { ...editorActionContext(editable, { ai: false }), canEdit: false })).toBe(false)
    }
  })
})

describe("an empty doc's starter", () => {
  it("offers three templates, the rest, and a file, as rows", () => {
    setup()
    const rows = [...document.querySelectorAll("[data-starter-row]")].map((r) => r.textContent)
    expect(rows).toEqual([...QUICK_DOC_TEMPLATES.map((t) => t.name), "More templates…", "Import a file… · Markdown, HTML or text"])
  })

  it("asks the server to write a template into this doc", async () => {
    applyTemplate.mockResolvedValue({ persisted: true })
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Meeting notes" }))
    await waitFor(() => expect(applyTemplate).toHaveBeenCalledWith("doc-1", QUICK_DOC_TEMPLATES[0].id))
  })

  it("says so when the server didn't add it", async () => {
    applyTemplate.mockRejectedValue({ response: { status: 409, data: { code: "not_empty", msg: "The doc has something in it already, so the template wasn't added." } } })
    setup()
    fireEvent.click(screen.getByRole("button", { name: "Project brief" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "The doc has something in it already, so the template wasn't added." })))
  })

  it("is reached with ↓ from the empty first line, walked with ↑ and ↓, and left with Esc", async () => {
    const editor = setup()
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" })
    const rows = [...document.querySelectorAll<HTMLElement>("[data-starter-row]")]
    expect(document.activeElement).toBe(rows[0])
    fireEvent.keyDown(rows[0], { key: "ArrowDown" })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[4], { key: "ArrowUp" })
    expect(document.activeElement).toBe(rows[3])
    // Back to the text (jsdom can't focus a contenteditable: the call is what's seen).
    const focus = vi.spyOn(editor.view, "focus")
    fireEvent.keyDown(rows[3], { key: "Escape" })
    await waitFor(() => expect(focus).toHaveBeenCalled())
  })

  it("leaves ↓ to the text once the doc has something in it", () => {
    const editor = setup("<p>Hello</p>")
    // Heard where the starter listens, ahead of the editor's own keys.
    const down = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })
    editor.view.dom.parentElement!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    expect(document.activeElement?.hasAttribute("data-starter-row")).toBe(false)
  })

  it("fills the doc from a Markdown file, as the person's own edit", async () => {
    const editor = setup()
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.accept).toBe(".md,.markdown,.txt,.html,.htm")
    const file = new File(["# Launch plan\n\nShip on **Tuesday**."], "plan.md", { type: "text/markdown" })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    // The codec loads on first use: give it a loaded machine's time.
    await waitFor(() => expect(editor.getHTML()).toContain("<h1>Launch plan</h1>"), { timeout: 10_000 })
    expect(editor.getHTML()).toContain("<strong>Tuesday</strong>")
  })

  it("adds nothing from a file once someone has typed in the meantime", async () => {
    const editor = setup()
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const file = new File(["first\n\nsecond"], "notes.txt", { type: "text/plain" })
    act(() => {
      editor.commands.insertContent("Typed first")
    })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The doc isn't empty any more" })), { timeout: 10_000 })
    expect(editor.getText()).toBe("Typed first")
  })
})
