import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import * as Y from "yjs"

const streamFetch = vi.fn()
vi.mock("@/lib/utils/streamFetch", () => ({ authedStreamFetch: (...a: unknown[]) => streamFetch(...a) }))
const recorded = vi.fn()
vi.mock("@/lib/ai/docAIApi", () => ({ recordAppliedEdit: (...a: unknown[]) => recorded(...a) }))

import { Proposals, acceptProposal, discardProposal, markDecided, proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import { BlockId } from "@/components/minimal-tiptap/extensions/block-id"
import { reviewerFor } from "@/components/proposals/reviewers"
import { DocAiMarkers } from "./docAiPlugin"
import { runAction, type Run } from "./docAiRun"

// Running a doc AI action in a live doc (ai-search-io P0-3, P1-1; N17, N43):
// two tabs on one doc, as the collaboration server joins them.

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})
beforeEach(() => {
  streamFetch.mockReset()
  recorded.mockReset()
  recorded.mockResolvedValue(undefined)
})

function tabs(html: string) {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on("update", (u: Uint8Array, origin: unknown) => origin !== "wire" && Y.applyUpdate(b, u, "wire"))
  b.on("update", (u: Uint8Array, origin: unknown) => origin !== "wire" && Y.applyUpdate(a, u, "wire"))
  const make = (doc: Y.Doc) => {
    const e = new Editor({
      element: document.createElement("div"),
      // As the doc editor has them: its undo is Yjs's, and every block has an id.
      extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: doc }), Proposals, BlockId, DocAiMarkers.configure({ docId: "d1" })],
    })
    editors.push(e)
    return e
  }
  const tabA = make(a)
  const tabB = make(b)
  tabA.commands.setContent(html)
  return { a, b, tabA, tabB }
}

const text = (e: Editor) => e.state.doc.textBetween(0, e.state.doc.content.size, "|")

/** The place of block `index`: from before it to after it. */
function block(e: Editor, index: number) {
  let from = 0
  for (let i = 0; i < index; i++) from += e.state.doc.child(i).nodeSize
  return { from, to: from + e.state.doc.child(index).nodeSize }
}

/** A stream the test feeds frame by frame. */
function controlled() {
  const queue: Array<Uint8Array | null> = []
  let wake: (() => void) | null = null
  const enc = new TextEncoder()
  const push = (frame: unknown) => {
    queue.push(enc.encode(`data: ${JSON.stringify(frame)}\n\n`))
    wake?.()
  }
  const response = {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          while (!queue.length) await new Promise<void>((r) => (wake = r))
          const v = queue.shift()!
          return v ? { done: false, value: v } : { done: true, value: undefined }
        },
        cancel: () => undefined,
        releaseLock: () => undefined,
      }),
    },
  }
  return { response, push, end: () => (queue.push(null), wake?.()) }
}

const model = { name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true }

/** Feeds a whole answer at once. */
function answer(text: string) {
  const s = controlled()
  streamFetch.mockResolvedValueOnce(s.response)
  s.push({ model })
  s.push({ content: text })
  s.push({ done: true })
  return s
}

const settled = (run: Run) =>
  new Promise<void>((resolve) => {
    const check = () => ["done", "error", "stopped"].includes(run.state.phase) && resolve()
    run.subscribe(check)
    check()
  })

const tick = () => new Promise((r) => setTimeout(r, 0))
/** A record is written after its text is fingerprinted (crypto.subtle): long enough for that. */
const recordedSoon = (times: number) => vi.waitFor(() => expect(recorded).toHaveBeenCalledTimes(times))
const notRecorded = async () => {
  await new Promise((r) => setTimeout(r, 60))
  expect(recorded).not.toHaveBeenCalled()
}

describe("a rewrite (a transform)", () => {
  it("is shown as a diff in this tab only, and Accept is one change that ⌘Z takes back", async () => {
    const { a, tabA, tabB } = tabs("<p>Intro.</p><p>We ship on Thursday and tell sales.</p>")
    answer("We ship on Friday and tell everyone.")
    const { from, to } = block(tabA, 1)
    const before = Y.encodeStateVector(a)
    const run = runAction({ editor: tabA, docId: "d1", action: "improve", from: from + 1, to: to - 1, model: null })
    await settled(run)
    expect(run.state.phase).toBe("done")
    const id = run.state.proposalId!
    expect(proposalsOf(tabA.state).active[id].proposal.hunks).toHaveLength(2)
    // Nothing reached the shared doc, nor the other tab.
    expect(Y.encodeStateVector(a)).toEqual(before)
    expect(text(tabB)).toBe("Intro.|We ship on Thursday and tell sales.")
    expect(tabB.view.dom.querySelector(".oc-proposal-ins")).toBeNull()

    acceptProposal(tabA, id)
    expect(text(tabA)).toBe("Intro.|We ship on Friday and tell everyone.")
    expect(text(tabB)).toBe("Intro.|We ship on Friday and tell everyone.")
    await recordedSoon(1)
    expect(recorded.mock.calls[0][0]).toMatchObject({ doc_uuid: "d1", action: "improve", model: "qwen3 4B", local: true, changes: 2, of: 2, inserted: false })
    tabA.commands.undo()
    expect(text(tabA)).toBe("Intro.|We ship on Thursday and tell sales.")
  })

  it("puts blocks for a whole line in the line's place, and one ⌘Z takes them back", async () => {
    const { tabA, tabB } = tabs("<p>Intro.</p><p>Ship it on Thursday and tell sales.</p>")
    answer("## Launch plan\n\n- Ship on Thursday\n- Tell sales")
    // Typed a moment ago, as the line was in the e2e run.
    await new Promise((r) => setTimeout(r, 600))
    const { from, to } = block(tabA, 1)
    const run = runAction({ editor: tabA, docId: "d1", action: "edit", prompt: "make it a plan", from: from + 1, to: to - 1, model: null })
    await settled(run)
    acceptProposal(tabA, run.state.proposalId!)
    const types = () => {
      const out: string[] = []
      tabA.state.doc.forEach((n) => {
        out.push(n.type.name)
      })
      return out
    }
    // No empty line is left before or after the blocks.
    expect(types()).toEqual(["paragraph", "heading", "bulletList"])
    expect(text(tabB)).toBe(text(tabA))
    tabA.commands.undo()
    expect(text(tabA)).toBe("Intro.|Ship it on Thursday and tell sales.")
    expect(text(tabB)).toBe("Intro.|Ship it on Thursday and tell sales.")
    await recordedSoon(1)
  })

  it("is still recorded where the browser can't make a hash (plain http)", async () => {
    const { tabA } = tabs("<p>We ship on Thursday.</p>")
    answer("We ship on Friday.")
    const real = globalThis.crypto
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) })
    try {
      const run = runAction({ editor: tabA, docId: "d1", action: "fix", from: 1, to: tabA.state.doc.child(0).nodeSize - 1, model: null })
      await settled(run)
      acceptProposal(tabA, run.state.proposalId!)
      await recordedSoon(1)
      expect(recorded.mock.calls[0][0]).toMatchObject({ before_hash: "", after_hash: "", changes: 1 })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("records two of three changes once, when the last one is decided", async () => {
    const { tabA } = tabs("<p>We ship on Thursday, tell sales and wait.</p>")
    answer("We ship on Friday, tell everyone and celebrate.")
    const { from, to } = block(tabA, 0)
    const run = runAction({ editor: tabA, docId: "d1", action: "improve", from: from + 1, to: to - 1, model: null })
    await settled(run)
    const id = run.state.proposalId!
    const hunks = proposalsOf(tabA.state).active[id].proposal.hunks.map((h) => h.id)
    expect(hunks).toHaveLength(3)
    acceptProposal(tabA, id, [hunks[0]])
    acceptProposal(tabA, id, [hunks[1]])
    await notRecorded()
    markDecided(tabA, id, [hunks[2]], "declined")
    await recordedSoon(1)
    expect(recorded.mock.calls[0][0]).toMatchObject({ changes: 2, of: 3 })
    expect(text(tabA)).toBe("We ship on Friday, tell everyone and wait.")
  })

  it("is never recorded when it is discarded, and leaves the doc as it was", async () => {
    const { tabA } = tabs("<p>We ship on Thursday.</p>")
    answer("We ship on Friday.")
    const run = runAction({ editor: tabA, docId: "d1", action: "fix", from: 1, to: tabA.state.doc.child(0).nodeSize - 1, model: null })
    await settled(run)
    discardProposal(tabA, run.state.proposalId!)
    expect(text(tabA)).toBe("We ship on Thursday.")
    await notRecorded()
  })

  it("lands on the text it was asked about after another tab's edit moved it (N43)", async () => {
    const { tabA, tabB } = tabs("<p>Intro.</p><p>We ship on Thursday.</p>")
    const s = controlled()
    streamFetch.mockResolvedValueOnce(s.response)
    const { from, to } = block(tabA, 1)
    const run = runAction({ editor: tabA, docId: "d1", action: "improve", from: from + 1, to: to - 1, model: null })
    await tick()
    // While the model writes, someone adds a paragraph above it in the other tab.
    tabB.commands.insertContentAt(0, "<p>Added by Maya.</p>")
    expect(text(tabA)).toBe("Added by Maya.|Intro.|We ship on Thursday.")
    s.push({ content: "We ship on Friday." })
    s.push({ done: true })
    await settled(run)
    acceptProposal(tabA, run.state.proposalId!)
    expect(text(tabA)).toBe("Added by Maya.|Intro.|We ship on Friday.")
    await recordedSoon(1)
  })

  it("says so when the text it was about is gone", async () => {
    const { tabA, tabB } = tabs("<p>Intro.</p><p>We ship on Thursday.</p>")
    const s = controlled()
    streamFetch.mockResolvedValueOnce(s.response)
    const { from, to } = block(tabA, 1)
    const run = runAction({ editor: tabA, docId: "d1", action: "improve", from: from + 1, to: to - 1, model: null })
    await tick()
    tabB.commands.setContent("<p>Intro.</p>")
    s.push({ content: "We ship on Friday." })
    s.push({ done: true })
    await settled(run)
    expect(run.state.phase).toBe("error")
    expect(run.state.error).toBe("The text you asked about isn't in the doc any more.")
  })
})

describe("a write", () => {
  it("streams in as ghost text nobody else sees, and goes in as real blocks on Accept (N17)", async () => {
    const { a, tabA, tabB } = tabs("<p>Intro.</p><p></p>")
    const s = controlled()
    streamFetch.mockResolvedValueOnce(s.response)
    const empty = block(tabA, 1)
    const handedOver = vi.fn()
    const run = runAction({ editor: tabA, docId: "d1", action: "write", prompt: "a rollout plan", from: empty.from + 1, to: empty.from + 1, model: null, onHandOver: handedOver })
    const before = Y.encodeStateVector(a)
    s.push({ model })
    s.push({ content: "## Rollout\n\n- Freeze on **Monday**\n" })
    await new Promise((r) => setTimeout(r, 30))
    expect(handedOver).toHaveBeenCalledTimes(1)
    expect(tabA.view.dom.querySelector(".oc-proposal-ins")?.textContent).toContain("Rollout")
    expect(tabB.view.dom.querySelector(".oc-proposal-ins")).toBeNull()
    expect(Y.encodeStateVector(a)).toEqual(before)
    expect(reviewerFor(run.state.proposalId)?.label).toBe("Writing · qwen3 4B, on your server")
    s.push({ content: "- Ship on Tuesday" })
    s.push({ done: true })
    await settled(run)
    expect(reviewerFor(run.state.proposalId)?.label).toBe("AI · qwen3 4B, on your server")
    acceptProposal(tabA, run.state.proposalId!)
    const types: string[] = []
    tabA.state.doc.forEach((n) => {
      types.push(n.type.name)
    })
    expect(types).toEqual(["paragraph", "heading", "bulletList"])
    expect(text(tabB)).toContain("Freeze on Monday")
    expect(text(tabB)).not.toContain("**")
    await recordedSoon(1)
    expect(recorded.mock.calls[0][0]).toMatchObject({ action: "write", changes: 1, of: 1 })
  })

  it("stops when it is discarded while still writing, and nothing goes in", async () => {
    const { tabA } = tabs("<p>Intro.</p><p></p>")
    const s = controlled()
    streamFetch.mockResolvedValueOnce(s.response)
    const empty = block(tabA, 1)
    const run = runAction({ editor: tabA, docId: "d1", action: "continue", from: empty.from + 1, to: empty.from + 1, model: null })
    s.push({ content: "More words" })
    await new Promise((r) => setTimeout(r, 30))
    const id = run.state.proposalId!
    const signal = streamFetch.mock.calls[0][1].signal as AbortSignal
    await reviewerFor(id)!.decline!(tabA, id)
    expect(signal.aborted).toBe(true)
    expect(text(tabA)).toBe("Intro.|")
    await notRecorded()
  })
})

describe("blocks chosen apart", () => {
  it("are read alone, never with what lies between them", async () => {
    const { tabA } = tabs("<p>First point.</p><p>Not chosen.</p><p>Third point.</p>")
    answer("Two points about the launch.")
    const one = block(tabA, 0)
    const three = block(tabA, 2)
    const run = runAction({ editor: tabA, docId: "d1", action: "explain", from: one.from, to: three.to, parts: [three, one], model: null })
    await settled(run)
    const body = streamFetch.mock.calls[0][1].jsonBody
    expect(body.text).toBe("First point.\n\nThird point.")
    expect(JSON.stringify(body)).not.toContain("Not chosen")
  })

  it("are never rewritten as one, which one answer can't split back", async () => {
    const { tabA } = tabs("<p>First point.</p><p>Not chosen.</p><p>Third point.</p>")
    const one = block(tabA, 0)
    const three = block(tabA, 2)
    const run = runAction({ editor: tabA, docId: "d1", action: "improve", from: one.from, to: three.to, parts: [one, three], model: null })
    expect(run.state).toMatchObject({ phase: "error", error: "Pick blocks that are next to each other to change them, or ask about these." })
    expect(streamFetch).not.toHaveBeenCalled()
  })
})

// Docs incident follow-up (15 Oct 2026): a summary needs only view, so a
// reader may ask for one; it is read in the bar, as an answer is, and never
// goes into the doc. An editor's summary goes in, as every write does. One
// action, one path: the output mode follows what the person may do.
describe("a summary", () => {
  it("is read in the bar for a reader, and the doc is unchanged", async () => {
    const { a, tabA } = tabs("<p>We ship on Thursday.</p><p>Docs go out Friday.</p>")
    tabA.setEditable(false)
    const before = Y.encodeStateVector(a)
    const was = tabA.getHTML()
    answer("Launch this week: ship Thursday, docs Friday.")
    const run = runAction({ editor: tabA, docId: "d1", action: "summarize", from: 1, to: 1, model: null, canChange: false })
    await settled(run)
    expect(run.state).toMatchObject({ phase: "done", kind: "answer", text: "Launch this week: ship Thursday, docs Friday.", proposalId: null })
    expect(Object.keys(proposalsOf(tabA.state).active)).toEqual([])
    expect(tabA.view.dom.querySelector(".oc-proposal-ins")).toBeNull()
    expect(tabA.getHTML()).toBe(was)
    expect(Y.encodeStateVector(a)).toEqual(before)
    // It asked for the same summary an editor's does: the whole doc.
    expect(streamFetch.mock.calls[0][1].jsonBody).toMatchObject({ action: "summarize", doc_id: "d1", scope: "doc" })
    await notRecorded()
  })

  it("is read in the bar when the request says the person can't change the doc, though the editor could", async () => {
    const { tabA } = tabs("<p>We ship on Thursday.</p>")
    answer("Ship Thursday.")
    const run = runAction({ editor: tabA, docId: "d1", action: "summarize", from: 1, to: 1, model: null, canChange: false })
    await settled(run)
    expect(run.state).toMatchObject({ kind: "answer", proposalId: null })
  })

  it("goes into the doc for an editor, as a write: ghost text until it is accepted", async () => {
    const { tabA } = tabs("<p>We ship on Thursday.</p><p></p>")
    const empty = block(tabA, 1)
    answer("Ship Thursday.")
    const run = runAction({ editor: tabA, docId: "d1", action: "summarize", from: empty.from + 1, to: empty.from + 1, model: null, canChange: true })
    await settled(run)
    expect(run.state.kind).toBe("write")
    expect(run.state.proposalId).not.toBeNull()
    acceptProposal(tabA, run.state.proposalId!)
    expect(text(tabA)).toContain("Ship Thursday.")
  })
})

describe("an answer", () => {
  it("is read in the bar and changes nothing in the doc", async () => {
    const { tabA } = tabs("<p>We ship on Thursday.</p>")
    answer("It means the launch is this week.")
    const run = runAction({ editor: tabA, docId: "d1", action: "explain", from: 1, to: 9, model: null })
    await settled(run)
    expect(run.state).toMatchObject({ phase: "done", kind: "answer", text: "It means the launch is this week.", proposalId: null })
    expect(Object.keys(proposalsOf(tabA.state).active)).toEqual([])
    // What it read: the selection, as Markdown.
    expect(streamFetch.mock.calls[0][1].jsonBody).toMatchObject({ action: "explain", doc_id: "d1", text: "We ship" })
  })

  it("says what went wrong", async () => {
    const { tabA } = tabs("<p>We ship.</p>")
    const s = controlled()
    streamFetch.mockResolvedValueOnce(s.response)
    s.push({ error: "AI is switched off in this workspace." })
    const run = runAction({ editor: tabA, docId: "d1", action: "explain", from: 1, to: 3, model: null })
    await settled(run)
    expect(run.state).toMatchObject({ phase: "error", error: "AI is switched off in this workspace." })
  })
})
