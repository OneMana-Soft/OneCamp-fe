import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"

const hoisted = vi.hoisted(() => ({ doc: undefined as Record<string, unknown> | undefined, toasts: [] as { title?: string }[] }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("./useDoc", () => ({ useDoc: () => hoisted.doc }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: { places: [{ resource_uuid: "g1" }] } } }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-me" } } }),
}))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => hoisted.toasts.push(t) }))

import PageGuard from "./PageGuard"
import { factsOf, setFacts } from "./pageFacts"
import { SoftLock } from "./softLock"

// The doc page's editor is made with the soft lock (chrome/register.ts); the
// guard, which loads later, keeps the facts it reads.
const editors: Editor[] = []
const make = (docId: string) => {
  const e = new Editor({ extensions: [StarterKit, SoftLock.configure({ docId })], content: "<p>Hello</p>", element: document.createElement("div") })
  editors.push(e)
  return e
}

afterEach(() => {
  cleanup()
  editors.splice(0).forEach((e) => e.destroy())
})

describe("the page guard (B6)", () => {
  it("holds the editor under a soft lock (D-12), lets go for this person on Unlock for me, and says why on a click", () => {
    hoisted.doc = { doc_lock_level: "soft", doc_edit_access: 1, doc_owner: { user_uuid: "u-other" } }
    const editor = make("g1")
    const plugins = editor.state.plugins
    render(<PageGuard docId="g1" editor={editor} />)
    expect(editor.isEditable).toBe(false)
    expect(editor.view.dom.getAttribute("contenteditable")).toBe("false")
    // ProseMirror reads where a press landed; jsdom has no layout to say.
    const at = document.elementFromPoint
    document.elementFromPoint = () => null
    fireEvent.mouseDown(editor.view.dom)
    document.elementFromPoint = at
    expect(hoisted.toasts[0]?.title).toBe("This page is locked")
    act(() => setFacts("g1", { unlockedForMe: true }))
    expect(editor.isEditable).toBe(true)
    act(() => setFacts("g1", { lock: "" }))
    expect(editor.isEditable).toBe(true)
    // The lock came and went through the facts: no plugin was added or taken away.
    expect(editor.state.plugins).toBe(plugins)
  })

  it("keeps what More reads current: the lock, whether it's starred, and whether this person owns it", () => {
    hoisted.doc = { doc_lock_level: "hard", doc_edit_access: 0, doc_owner: { user_uuid: "u-me" }, doc_full_access: 1 }
    render(<PageGuard docId="g1" editor={make("g1")} />)
    expect(factsOf("g1")).toMatchObject({ lock: "hard", owner: true, full: true, starred: true })
  })

  it("leaves an unlocked doc's editor as its page made it", () => {
    hoisted.doc = { doc_edit_access: 1 }
    const editor = make("g2")
    const plugins = editor.state.plugins
    const view = render(<PageGuard docId="g2" editor={editor} />)
    expect(editor.isEditable).toBe(true)
    view.unmount()
    // Gone with the guard: its facts, never the editor's plugins.
    expect(factsOf("g2")).toEqual({})
    expect(editor.state.plugins).toBe(plugins)
    expect(editor.isEditable).toBe(true)
  })
})
