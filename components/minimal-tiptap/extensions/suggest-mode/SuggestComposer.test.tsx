import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import * as Y from "yjs"
import { Proposals, proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"

// Writing a suggestion: the change is drawn in the doc as it is typed, in a
// person's green; ⌘↵ keeps it; Esc lets go of it; words that change under
// it suggest nothing.

const submitted = vi.fn()
vi.mock("@/components/proposals/persisted", () => ({ submitProposal: (...a: unknown[]) => submitted(...a) }))

const { SuggestComposer } = await import("./SuggestComposer")

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  submitted.mockReset()
  while (editors.length) editors.pop()?.destroy()
})

function tabs(html: string) {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "wire") Y.applyUpdate(b, u, "wire")
  })
  b.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "wire") Y.applyUpdate(a, u, "wire")
  })
  const make = (doc: Y.Doc) => {
    const e = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: doc }), Proposals],
    })
    editors.push(e)
    return e
  }
  const tabA = make(a)
  const tabB = make(b)
  tabA.commands.setContent(html)
  return { tabA, tabB }
}

function find(e: Editor, word: string) {
  let at = -1
  e.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(word)) at = pos + node.text.indexOf(word)
  })
  return { from: at, to: at + word.length }
}

const drafts = (e: Editor) => Object.values(proposalsOf(e.state).active)

describe("writing a suggestion", () => {
  it("draws the change as it is typed, in a person's green, and changes nothing in the doc", () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    render(<SuggestComposer editor={tabA} docId="d1" open={find(tabA, "Friday")} onClose={vi.fn()} />)
    const field = screen.getByLabelText("Suggest these words instead") as HTMLTextAreaElement
    expect(field.value).toBe("Friday")
    expect(drafts(tabA)).toHaveLength(0)
    fireEvent.change(field, { target: { value: "Monday" } })
    expect(drafts(tabA)).toHaveLength(1)
    expect(drafts(tabA)[0].proposal.author_kind).toBe("person")
    expect(tabA.view.dom.querySelector('[data-by="person"]')).toBeTruthy()
    expect(tabA.state.doc.textContent).toBe("Ship the launch on Friday")
    // Back to the words as they were: nothing to suggest, nothing drawn.
    fireEvent.change(field, { target: { value: "Friday" } })
    expect(drafts(tabA)).toHaveLength(0)
    expect((screen.getByRole("button", { name: "Suggest" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("takes in what was typed before its field had the focus, and what comes after it opened", () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    const at = { ...find(tabA, "Friday"), seed: "M", late: "o" }
    const { rerender } = render(<SuggestComposer editor={tabA} docId="d1" open={at} onClose={vi.fn()} />)
    const field = screen.getByLabelText("Suggest these words instead") as HTMLTextAreaElement
    expect(field.value).toBe("Mo")
    rerender(<SuggestComposer editor={tabA} docId="d1" open={{ ...at, late: "onday" }} onClose={vi.fn()} />)
    expect(field.value).toBe("Monday")
  })

  it("keeps it with ⌘↵, with a note, for the doc's people to review", async () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    const onClose = vi.fn()
    submitted.mockResolvedValue({ id: "kept-1" })
    render(<SuggestComposer editor={tabA} docId="d1" open={{ ...find(tabA, "Friday"), seed: "M" }} onClose={onClose} />)
    const field = screen.getByLabelText("Suggest these words instead") as HTMLTextAreaElement
    expect(field.value).toBe("M")
    fireEvent.change(field, { target: { value: "Monday" } })
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }))
    fireEvent.change(screen.getByLabelText("A note for whoever reviews it"), { target: { value: "Friday is a holiday" } })
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter", metaKey: true })
    })
    expect(submitted).toHaveBeenCalledTimes(1)
    const [editor, tracked, docId, opts] = submitted.mock.calls[0]
    expect(editor).toBe(tabA)
    expect(docId).toBe("d1")
    expect(opts).toEqual({ note: "Friday is a holiday" })
    expect(tracked.proposal.author_kind).toBe("person")
    expect(onClose).toHaveBeenCalled()
  })

  it("says what didn't happen, and keeps the words, when the server refuses", async () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    submitted.mockRejectedValue({ response: { status: 423, data: { msg: "This doc is locked, so it takes no suggestions." } } })
    const onClose = vi.fn()
    render(<SuggestComposer editor={tabA} docId="d1" open={{ ...find(tabA, "Friday"), seed: "Monday" }} onClose={onClose} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Suggest" }))
    })
    expect(screen.getByRole("alert").textContent).toBe("This doc is locked, so it takes no suggestions.")
    expect((screen.getByLabelText("Suggest these words instead") as HTMLTextAreaElement).value).toBe("Monday")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("says busy while it sends, stays in reach, and sends it once", async () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    let answer: (value: unknown) => void = () => {}
    submitted.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    render(<SuggestComposer editor={tabA} docId="d1" open={{ ...find(tabA, "Friday"), seed: "Monday" }} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Suggest" }))
    })
    const sending = screen.getByRole("button", { name: "Suggesting…" }) as HTMLButtonElement
    expect(sending.getAttribute("aria-busy")).toBe("true")
    expect(sending.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(sending)
    })
    expect(submitted).toHaveBeenCalledTimes(1)
    await act(async () => answer({ id: "kept-1" }))
  })

  it("lets go of the drawn change on Esc", () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    const onClose = vi.fn()
    render(<SuggestComposer editor={tabA} docId="d1" open={{ ...find(tabA, "Friday"), seed: "Monday" }} onClose={onClose} />)
    expect(drafts(tabA)).toHaveLength(1)
    fireEvent.keyDown(screen.getByLabelText("Suggest these words instead"), { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
    expect(drafts(tabA)).toHaveLength(0)
  })

  it("suggests nothing when the words chosen change under it", () => {
    const { tabA, tabB } = tabs("<p>Ship the launch on Friday</p>")
    render(<SuggestComposer editor={tabA} docId="d1" open={{ ...find(tabA, "Friday"), seed: "Monday" }} onClose={vi.fn()} />)
    act(() => {
      const inB = find(tabB, "Friday")
      tabB.commands.insertContentAt(inB.from + 2, "zz")
    })
    expect(screen.getByRole("alert").textContent).toMatch(/changed while you wrote/)
    expect((screen.getByRole("button", { name: "Suggest" }) as HTMLButtonElement).disabled).toBe(true)
    expect(drafts(tabA)).toHaveLength(0)
  })

  it("at a caret, suggests words to add there", () => {
    const { tabA } = tabs("<p>Ship the launch</p>")
    const at = find(tabA, "launch").from
    render(<SuggestComposer editor={tabA} docId="d1" open={{ from: at, to: at, seed: "big " }} onClose={vi.fn()} />)
    expect((screen.getByLabelText("Suggest words to add here") as HTMLTextAreaElement).value).toBe("big ")
    expect(drafts(tabA)).toHaveLength(1)
  })
})
