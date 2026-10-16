import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { leaveDoc, setFacts } from "./pageFacts"
import { SoftLock } from "./softLock"

// B6's soft lock (D-12) is the doc page editor's own from when it is made,
// and follows the page's facts. It used to be added by the page guard when
// its chunk loaded, and adding a plugin to an open editor makes every plugin
// view again (blocks.spec's "/" menu closed, a block link's flash was lost).

beforeAll(async () => {
  await loadBlocks("doc", ALL_EDITIONS)
  await loadBlocks("guest", ALL_EDITIONS)
}, 30_000)

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy())
  leaveDoc("s1")
  leaveDoc("s2")
})

const make = (docId: string) => {
  const e = new Editor({ element: document.createElement("div"), extensions: [StarterKit, SoftLock.configure({ docId })], content: "<p>Hello</p>" })
  editors.push(e)
  return e
}

describe("the soft lock", () => {
  it("holds its doc's editor while the doc is soft-locked and not unlocked for this person, with the plugins it was made with", () => {
    const editor = make("s1")
    const other = make("s2")
    const plugins = editor.state.plugins
    expect(editor.isEditable).toBe(true)
    setFacts("s1", { lock: "soft" })
    expect(editor.isEditable).toBe(false)
    expect(editor.view.dom.getAttribute("contenteditable")).toBe("false")
    // Another doc's lock is its own.
    expect(other.isEditable).toBe(true)
    setFacts("s1", { unlockedForMe: true })
    expect(editor.isEditable).toBe(true)
    setFacts("s1", { unlockedForMe: false, lock: "hard" })
    // A hard lock is the server's: the editor's level says it.
    expect(editor.isEditable).toBe(true)
    setFacts("s1", { lock: "soft" })
    leaveDoc("s1")
    expect(editor.isEditable).toBe(true)
    expect(editor.state.plugins).toBe(plugins)
  })

  it("is given to the doc page's editor by the registry, for its doc, and to no other", () => {
    const named = (ctx: Parameters<typeof extensionsFor>[0]) => extensionsFor(ctx).map((e) => e.name)
    expect(named({ ...bareContext("doc", ALL_EDITIONS), docId: "s1" })).toContain("b6SoftLock")
    // An editor of no doc (a preview) and the guest's page have none.
    expect(named(bareContext("doc", ALL_EDITIONS))).not.toContain("b6SoftLock")
    expect(named({ ...bareContext("guest", ALL_EDITIONS), docId: "s1" })).not.toContain("b6SoftLock")
  })
})
