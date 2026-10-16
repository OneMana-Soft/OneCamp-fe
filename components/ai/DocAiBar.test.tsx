import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"

const streamFetch = vi.fn()
vi.mock("@/lib/utils/streamFetch", () => ({ authedStreamFetch: (...a: unknown[]) => streamFetch(...a) }))
const local = { name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true }
vi.mock("@/lib/ai/docAIApi", () => ({
  getDocAIModel: vi.fn(async () => local),
  getDocAIStarters: vi.fn(async () => null),
  recordAppliedEdit: vi.fn(async () => undefined),
  findDocTasks: vi.fn(),
  makeDocTasks: vi.fn(),
  messageOf: (_e: unknown, f: string) => f,
}))
// What the server says each action needs (/ai/status doc_action_needs): none
// unless a test sets it, and then a reader is offered what reads the doc.
let needs: Record<string, string> | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false }),
  useFetchOnlyOnce: () => ({ data: needs ? { data: { doc_action_needs: needs } } : undefined }),
}))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => true }))

import { Proposals } from "@/components/minimal-tiptap/extensions/proposals"
import { DocAiMarkers } from "./docAiPlugin"
import { aiBarOf, openAiBar, spaceRestsAt, type BarRequest } from "./docAiStore"
import DocAiBar, { placeOf } from "./DocAiBar"
import { BlockId } from "@/components/minimal-tiptap/extensions/block-id"
import { loadCodec } from "@/lib/ai/docAIContent"

// The doc AI bar (ai-search-io P0-5, P0-6): what it offers where it was
// opened, the model named before anything is sent, the first word's wait,
// answers read in the bar, and its keys.

// The codec loads with the bar's first action; here, once, before the clock matters.
beforeAll(() => loadCodec(), 30_000)

let editor: Editor
beforeEach(() => {
  streamFetch.mockReset()
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Proposals, DocAiMarkers.configure({ docId: "d1" })],
    content: "<p>We ship on Thursday.</p><p></p>",
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  editor.destroy()
})

function stream(frames: unknown[], { end = true } = {}) {
  const enc = new TextEncoder()
  const chunks = frames.map((f) => enc.encode(`data: ${JSON.stringify(f)}\n\n`))
  streamFetch.mockResolvedValueOnce({
    ok: true,
    body: {
      getReader: () => ({
        read: () => (chunks.length ? Promise.resolve({ done: false, value: chunks.shift() }) : end ? Promise.resolve({ done: true, value: undefined }) : new Promise(() => {})),
        cancel: () => undefined,
        releaseLock: () => undefined,
      }),
    },
  })
}

function bar(request: Partial<BarRequest> = {}) {
  const req: BarRequest = { docId: "d1", from: 1, to: 1, mode: "actions", source: "action", ...request }
  openAiBar(editor, req)
  return render(<DocAiBar editor={editor} docId="d1" request={req} />)
}

const field = () => screen.getByRole("combobox")
const options = () => screen.queryAllByRole("option").map((o) => o.textContent)
const headings = () => Array.from(document.querySelectorAll('[role="listbox"] > li[role="presentation"]')).map((h) => h.textContent)

describe("the bar", () => {
  it("names the model before anything is sent", async () => {
    bar()
    expect(await screen.findByText("Runs on your server · qwen3 4B")).toBeTruthy()
    expect(streamFetch).not.toHaveBeenCalled()
  })

  it("offers a selection's edits and questions, narrowed by what is typed", async () => {
    bar({ from: 1, to: 8 })
    expect(options()).toEqual([
      "Improve writing",
      "Fix spelling and grammar",
      "Make shorter",
      "Make longer",
      "Simplify language",
      "Change tone",
      "Translate",
      "Explain",
      "Summarise",
      "Ask about this doc…",
    ])
    fireEvent.change(field(), { target: { value: "short" } })
    expect(options()).toEqual(["Edit: short", "Make shorter"])
  })

  it("runs what is picked with ⏎", async () => {
    stream([{ model: local }, { content: "We ship Thursday." }, { done: true }])
    bar({ from: 1, to: 22 })
    fireEvent.keyDown(field(), { key: "ArrowDown" })
    fireEvent.keyDown(field(), { key: "ArrowDown" })
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" })
    })
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled())
    expect(streamFetch.mock.calls[0][1].jsonBody).toMatchObject({ action: "shorter", text: "We ship on Thursday." })
  })

  it("answers a question in the bar, with Insert below for someone who can edit", async () => {
    stream([{ model: local }, { content: "On Thursday." }, { done: true }])
    bar()
    fireEvent.change(field(), { target: { value: "when do we ship?" } })
    expect(options()[0]).toBe("Ask: when do we ship?")
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" })
    })
    expect(await screen.findByText("On Thursday.")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Insert below/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Continue in panel/ })).toBeTruthy()
  })

  it("only answers a reader, and offers nothing they can't do", async () => {
    editor.setEditable(false)
    stream([{ content: "On Thursday." }, { done: true }])
    bar()
    expect(field().getAttribute("placeholder")).toBe("Ask about this doc…")
    expect(options()).toEqual([])
    fireEvent.change(field(), { target: { value: "ship date" } })
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" })
    })
    expect(await screen.findByText("On Thursday.")).toBeTruthy()
    expect(streamFetch.mock.calls[0][1].jsonBody).toMatchObject({ action: "ask", prompt: "ship date" })
    expect(screen.queryByRole("button", { name: /Insert below/ })).toBeNull()
  })

  // Docs incident, 14 Oct 2026 (D1): a reader asks what reads the doc, by the
  // server's list, and is offered nothing that changes it.
  it("offers a reader what reads the doc, by the server's list, and nothing that changes it", () => {
    needs = { explain: "view", ask: "view", summarize: "view", translate: "view", improve: "edit", fix: "edit", continue: "edit" }
    try {
      editor.setEditable(false)
      bar({ from: 1, to: 8 })
      const offered = options()
      expect(offered).toEqual(["Explain", "Summarise", "Ask about this doc…"])
      expect(offered).not.toContain("Improve writing")
      expect(offered).not.toContain("Fix spelling and grammar")
    } finally {
      needs = undefined
    }
  })

  // Docs incident follow-up (15 Oct 2026): a reader's Summarise is read where
  // Explain and Ask are; nothing a reader is offered or types reads as a change.
  it("reads a reader's summary in the bar, under Ask, and leaves the doc as it was", async () => {
    needs = { explain: "view", ask: "view", summarize: "view", translate: "view", improve: "edit", fix: "edit", continue: "edit" }
    try {
      editor.setEditable(false)
      const was = editor.getHTML()
      stream([{ content: "Ship Thursday." }, { done: true }])
      bar()
      expect(field().getAttribute("placeholder")).toBe("Ask about this doc…")
      expect(options()).toEqual(["Summarise", "Ask about this doc…"])
      expect(headings()).toEqual(["Ask"])
      await act(async () => {
        fireEvent.click(screen.getByText("Summarise"))
      })
      expect(await screen.findByText("Ship Thursday.")).toBeTruthy()
      expect(streamFetch.mock.calls[0][1].jsonBody).toMatchObject({ action: "summarize", scope: "doc" })
      expect(screen.queryByRole("button", { name: /Insert below/ })).toBeNull()
      expect(editor.getHTML()).toBe(was)
    } finally {
      needs = undefined
    }
  })

  it("asks what a reader types, never edits or writes it", () => {
    needs = { explain: "view", ask: "view", summarize: "view", translate: "view", improve: "edit", fix: "edit", continue: "edit" }
    try {
      editor.setEditable(false)
      bar({ from: 1, to: 8 })
      expect(field().getAttribute("placeholder")).toBe("Ask about the selection…")
      fireEvent.change(field(), { target: { value: "short" } })
      expect(options()).toEqual(["Ask: short"])
      fireEvent.change(field(), { target: { value: "a haiku about it" } })
      expect(options()[0]).toBe("Ask: a haiku about it")
    } finally {
      needs = undefined
    }
  })

  it("takes a reader back from a question to their actions, with Esc or the back arrow", () => {
    needs = { explain: "view", ask: "view", summarize: "view", translate: "view", improve: "edit", fix: "edit", continue: "edit" }
    try {
      editor.setEditable(false)
      bar({ from: 1, to: 8 })
      const actions = ["Explain", "Summarise", "Ask about this doc…"]
      fireEvent.click(screen.getByText("Ask about this doc…"))
      expect(options()).toEqual([])
      fireEvent.keyDown(field(), { key: "Escape" })
      expect(options()).toEqual(actions)
      expect(aiBarOf(editor).open).toBe(true)
      fireEvent.click(screen.getByText("Ask about this doc…"))
      fireEvent.click(screen.getByRole("button", { name: "Back to the actions" }))
      expect(options()).toEqual(actions)
    } finally {
      needs = undefined
    }
  })

  it("says after 8 s that a local model is still writing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stream([{ model: local }], { end: false })
    bar()
    fireEvent.change(field(), { target: { value: "who owns it?" } })
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" })
    })
    expect(screen.getByRole("status").textContent).toBe("Reading the doc…")
    await act(async () => {
      vi.advanceTimersByTime(8000)
    })
    expect(screen.getByRole("status").textContent).toBe("Still writing · local model")
  })

  it("goes into a question with “Ask about this doc…”, and back with Esc", () => {
    bar()
    fireEvent.click(screen.getByText("Ask about this doc…"))
    expect(field().getAttribute("placeholder")).toBe("Ask about this doc…")
    expect(options()).toEqual([])
    fireEvent.keyDown(field(), { key: "Escape" })
    expect(field().getAttribute("placeholder")).toBe("Ask AI to write, or pick an action…")
    expect(aiBarOf(editor).open).toBe(true)
  })

  it("reads blocks the block menu chose apart alone, and only answers about them", async () => {
    const blocks = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit, Proposals, BlockId],
      content: '<p data-block-id="b1">First point.</p><p data-block-id="b2">Not chosen.</p><p data-block-id="b3">Third point.</p>',
    })
    const sizes = [0, 1, 2].map((i) => blocks.state.doc.child(i).nodeSize)
    // Next to each other: one range, as a selection is.
    expect(placeOf(blocks, { docId: "d1", from: 0, to: 0, mode: "actions", source: "action", blocks: ["b2", "b1"] })).toEqual({
      from: 0,
      to: sizes[0] + sizes[1],
      parts: null,
    })
    // Apart: each alone.
    const apart = placeOf(blocks, { docId: "d1", from: 0, to: 0, mode: "actions", source: "action", blocks: ["b1", "b3"] })
    expect(apart.parts).toEqual([
      { from: 0, to: sizes[0] },
      { from: sizes[0] + sizes[1], to: sizes[0] + sizes[1] + sizes[2] },
    ])
    stream([{ content: "Both are about the launch." }, { done: true }])
    openAiBar(blocks, { docId: "d1", from: 0, to: 0, mode: "actions", source: "action", blocks: ["b1", "b3"] })
    render(<DocAiBar editor={blocks} docId="d1" request={{ docId: "d1", from: 0, to: 0, mode: "actions", source: "action", blocks: ["b1", "b3"] }} />)
    expect(field().getAttribute("placeholder")).toBe("Ask about these blocks…")
    expect(options()).toEqual(["Explain", "Summarise", "Ask about this doc…"])
    fireEvent.change(field(), { target: { value: "make them shorter" } })
    expect(options()[0]).toBe("Ask: make them shorter")
    await act(async () => {
      fireEvent.keyDown(field(), { key: "Enter" })
    })
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled())
    expect(streamFetch.mock.calls[0][1].jsonBody).toMatchObject({ action: "ask", text: "First point.\n\nThird point." })
    blocks.destroy()
  })

  it("closes with Esc, and a space opened it, the next space there types", () => {
    const at = editor.state.doc.child(0).nodeSize + 1
    bar({ from: at, to: at, source: "space" })
    fireEvent.keyDown(field(), { key: "Escape" })
    expect(aiBarOf(editor).open).toBe(false)
    expect(spaceRestsAt(editor, at - 1)).toBe(true)
  })
})
