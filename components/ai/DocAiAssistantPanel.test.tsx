import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore, type Middleware } from "@reduxjs/toolkit"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"

const streamFetch = vi.fn()
vi.mock("@/lib/utils/streamFetch", () => ({ authedStreamFetch: (...a: unknown[]) => streamFetch(...a) }))
const recorded = vi.fn(async () => undefined)
vi.mock("@/lib/ai/docAIApi", () => ({
  getDocAIModel: vi.fn(async () => ({ name: "qwen3:4b", label: "qwen3 4B", provider: "ollama", local: true })),
  recordAppliedEdit: (...a: unknown[]) => recorded(...(a as [])),
}))
const feature = { state: "available" as "available" | "unknown" | "unavailable" }
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => feature.state }))
// The right panel's header asks the screen's size (a narrow window's right panel, below).
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: true, isDesktop: false }) }))
const toasts = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toasts(t), useToast: () => ({ toast: toasts }) }))

import { Proposals, acceptProposal, proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import { attachBus, createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import type { DocCommandBus } from "@/components/docEditor/registry/types"
import { loadCodec } from "@/lib/ai/docAIContent"
import { DocAiMarkers, pinRange } from "./docAiPlugin"
import { handToPanel, setPanelPin } from "./docAiStore"
import { DocAiAssistantPanel } from "./DocAiAssistantPanel"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { OverlaySheet } from "@/components/ui/overlaySheet"
import { TooltipProvider } from "@/components/ui/tooltip"
import { onEscape } from "@/lib/keys/onEscape"

// The doc AI panel, the long conversation's place (N17, N43, N44): its
// answers go into the doc as blocks to review, on the text it was opened on,
// and its controls do what they say.

beforeAll(() => loadCodec(), 30_000)

let editor: Editor
let bus: DocCommandBus
let detach: () => void
beforeEach(() => {
  streamFetch.mockReset()
  recorded.mockClear()
  toasts.mockReset()
  feature.state = "available"
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Proposals, DocAiMarkers.configure({ docId: "d1" })],
    content: "<p>Intro.</p><p>We ship on Thursday.</p>",
  })
  bus = createDocCommandBus("d1")
  detach = attachBus(editor, bus)
})
afterEach(() => {
  cleanup()
  detach()
  editor.destroy()
})

/** A stream the test feeds; each read waits for the next frame. */
function controlled() {
  const queue: Array<Uint8Array | null> = []
  let wake: (() => void) | null = null
  const enc = new TextEncoder()
  streamFetch.mockImplementationOnce(async (_url: string, opts: { signal?: AbortSignal }) => ({
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          while (!queue.length) {
            if (opts.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" })
            await new Promise<void>((r) => {
              wake = r
              opts.signal?.addEventListener("abort", () => r(), { once: true })
            })
          }
          const v = queue.shift()!
          return v ? { done: false, value: v } : { done: true, value: undefined }
        },
        cancel: () => undefined,
        releaseLock: () => undefined,
      }),
    },
  }))
  return {
    push(frame: unknown) {
      queue.push(enc.encode(`data: ${JSON.stringify(frame)}\n\n`))
      wake?.()
    },
    end() {
      queue.push(null)
      wake?.()
    },
  }
}

function whole(text: string, extra: Record<string, unknown> = {}) {
  const s = controlled()
  s.push({ content: text })
  if (Object.keys(extra).length) s.push(extra)
  s.push({ done: true })
}

const second = () => {
  const from = editor.state.doc.child(0).nodeSize + 1
  return { from, to: from + editor.state.doc.child(1).content.size }
}

function panel(props: Partial<React.ComponentProps<typeof DocAiAssistantPanel>> = {}) {
  const store = configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })
  return render(
    <Provider store={store}>
      <DocAiAssistantPanel selectedText="" docId="d1" onClose={props.onClose ?? (() => {})} {...props} />
    </Provider>,
  )
}

const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 20))
})

describe("the panel's answers go into the doc as a change to review", () => {
  it("replaces the text it was opened on, wherever edits moved it, as blocks (N17, N43)", async () => {
    const { from, to } = second()
    setPanelPin(editor, pinRange(editor, from, to))
    whole("We ship on **Friday**.")
    panel({ selectedText: "We ship on Thursday.", initialAction: "improve" })
    await screen.findByText("Friday", {}, { timeout: 3000 })
    // Someone adds a line above while the answer is read.
    editor.commands.insertContentAt(0, "<p>Added by Maya.</p>")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Replace the selection" }))
    })
    await settle()
    const id = proposalsOf(editor.state).focus!
    acceptProposal(editor, id)
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, "|")).toBe("Added by Maya.|Intro.|We ship on Friday.")
    expect(JSON.stringify(editor.getJSON())).toContain('"bold"')
    // ⌘Z takes it back: the panel keeps no undo of its own.
    editor.commands.undo()
    expect(editor.state.doc.textContent).toContain("Thursday")
    await vi.waitFor(() => expect(recorded).toHaveBeenCalledTimes(1))
    expect(recorded.mock.calls[0]).toEqual([expect.objectContaining({ action: "improve", model: "qwen3 4B", local: true, inserted: false })])
  })

  it("offers only Insert below for an answer about the doc", async () => {
    whole("It ships Thursday.")
    panel({ initialAction: "summarize" })
    await screen.findByText("It ships Thursday.", {}, { timeout: 3000 })
    expect(screen.queryByRole("button", { name: "Replace the selection" })).toBeNull()
    expect(screen.getByRole("button", { name: "Insert below" })).toBeTruthy()
  })
})

describe("the panel's controls (N44)", () => {
  it("stops a stream with Back, so no later word brings the answer back", async () => {
    const s = controlled()
    panel({ selectedText: "We ship on Thursday.", initialAction: "improve" })
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled(), { timeout: 3000 })
    s.push({ content: "We ship" })
    await screen.findByText("We ship")
    fireEvent.click(screen.getByRole("button", { name: "Back to the actions" }))
    const signal = streamFetch.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(true)
    s.push({ content: " on Friday." })
    await settle()
    expect(document.querySelector("[data-doc-ai-panel-run]")).toBeNull()
    expect(screen.queryByText(/on Friday/)).toBeNull()
    expect(screen.getByRole("button", { name: /Improve writing/ })).toBeTruthy()
  })

  it("shows Stop while words arrive, and Stop keeps the words", async () => {
    const s = controlled()
    panel({ selectedText: "We ship on Thursday.", initialAction: "improve" })
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled(), { timeout: 3000 })
    s.push({ content: "We ship on Friday" })
    await screen.findByText("We ship on Friday")
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }))
    await settle()
    expect(screen.getByText("We ship on Friday")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Stop/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Replace the selection" })).toBeTruthy()
  })

  it("keeps a notice with the run it belongs to", async () => {
    whole("Short summary.", { notice: "Only the first part of the doc was read." })
    panel({ initialAction: "summarize" })
    await screen.findByText("Only the first part of the doc was read.", {}, { timeout: 3000 })
    whole("Another summary.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByText("Another summary.", {}, { timeout: 3000 })
    expect(screen.queryByText("Only the first part of the doc was read.")).toBeNull()
  })

  it("runs the same action asked twice, twice", async () => {
    whole("First.")
    panel({ initialAction: "summarize" })
    await screen.findByText("First.", {}, { timeout: 3000 })
    whole("Second.")
    act(() => bus.emit("aiRun", { action: "summarize" }))
    await screen.findByText("Second.", {}, { timeout: 3000 })
    expect(streamFetch).toHaveBeenCalledTimes(2)
  })

  it("goes on from the bar's answer instead of asking again", async () => {
    handToPanel(editor, { action: "explain", prompt: undefined, text: "It means this week.", model: null })
    panel({ initialAction: "explain" })
    expect(await screen.findByText("It means this week.")).toBeTruthy()
    expect(streamFetch).not.toHaveBeenCalled()
  })

  it("handles Esc: it stops, then goes back, then closes", async () => {
    const onClose = vi.fn()
    const s = controlled()
    panel({ selectedText: "We ship on Thursday.", initialAction: "improve", onClose })
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled(), { timeout: 3000 })
    s.push({ content: "We ship" })
    const words = await screen.findByText("We ship")
    fireEvent.keyDown(words, { key: "Escape" })
    await settle()
    expect(screen.queryByRole("button", { name: /Stop/ })).toBeNull()
    fireEvent.keyDown(screen.getByText("We ship"), { key: "Escape" })
    expect(screen.getByRole("button", { name: /Improve writing/ })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("button", { name: /Improve writing/ }), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("takes the keys when it opens, so Esc reaches it over the doc", async () => {
    const onClose = vi.fn()
    panel({ onClose })
    const root = document.querySelector("[data-doc-ai-panel]") as HTMLElement
    expect(document.activeElement).toBe(root)
    fireEvent.keyDown(root, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("says when the browser won't copy", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) } })
    whole("Copy me.")
    panel({ initialAction: "summarize" })
    await screen.findByText("Copy me.", {}, { timeout: 3000 })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy the answer" }))
    })
    expect(toasts).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
  })

  it("holds its place while the AI setting loads, then runs what it was opened with (N18)", async () => {
    feature.state = "unknown"
    whole("Done.")
    const view = panel({ initialAction: "summarize" })
    expect(screen.getByRole("status", { name: "Loading the AI panel" })).toBeTruthy()
    expect(streamFetch).not.toHaveBeenCalled()
    feature.state = "available"
    view.rerender(
      <Provider store={configureStore({ reducer: { ui: (s: Record<string, unknown> = {}) => s } })}>
        <DocAiAssistantPanel selectedText="" docId="d1" onClose={() => {}} initialAction="summarize" />
      </Provider>,
    )
    expect(await screen.findByText("Done.", {}, { timeout: 3000 })).toBeTruthy()
  })

  it("draws nothing where AI is off", () => {
    feature.state = "unavailable"
    const { container } = panel()
    expect(container.textContent).toBe("")
  })
})

// On a phone the panel is the AI sheet's content (docInput: the shared
// drawer, which leaves Esc to what answers it). The sheet heard Esc first and
// closed, with a run still writing; the panel took no press it was left.
describe("the panel in the phone's sheet", () => {
  it("stops on Esc, then goes back, and the sheet stays; then it closes", async () => {
    const onClose = vi.fn()
    const onOpenChange = vi.fn()
    const s = controlled()
    const store = configureStore({ reducer: { ui: (st: Record<string, unknown> = {}) => st } })
    render(
      <Provider store={store}>
        <Drawer open onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerTitle className="sr-only">OneCamp AI</DrawerTitle>
            <DrawerDescription className="sr-only">Write and change text with AI.</DrawerDescription>
            <DocAiAssistantPanel selectedText="We ship on Thursday." docId="d1" initialAction="improve" onClose={onClose} />
          </DrawerContent>
        </Drawer>
      </Provider>,
    )
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled(), { timeout: 3000 })
    s.push({ content: "We ship" })
    const words = await screen.findByText("We ship")
    fireEvent.keyDown(words, { key: "Escape" })
    await settle()
    expect(screen.queryByRole("button", { name: /Stop/ })).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByText("We ship"), { key: "Escape" })
    expect(screen.getByRole("button", { name: /Improve writing/ })).toBeTruthy()
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole("button", { name: /Improve writing/ }), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// The answer as it streams (DRAWERS, 17 Oct). On a computer it has a box of
// its own, at most 350 px, which follows its last line. In the phone's sheet
// that box inside the panel's scroller made two (a flick moved the wrong
// one), so there the answer grows in the panel's one scroller, which follows
// it instead. e2e/phoneSheets.spec.ts measures the sheet.
describe("the answer as it streams", () => {
  // jsdom lays nothing out: the scroller followed is given a height.
  const tall = (el: HTMLElement) => Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 5000 })

  it("in the phone's sheet, grows in the panel's one scroller, which follows its last line", async () => {
    const s = controlled()
    panel({ selectedText: "We ship on Thursday.", initialAction: "improve", sheet: true })
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled(), { timeout: 3000 })
    const viewport = document.querySelector<HTMLElement>("[data-doc-ai-panel] [data-radix-scroll-area-viewport]")!
    tall(viewport)
    s.push({ content: "We ship" })
    await screen.findByText("We ship")
    const answer = document.querySelector<HTMLElement>("[data-ai-answer]")!
    expect(answer.className, "the answer's own box, a second scroller in the sheet").not.toMatch(/max-h-|overflow-y-auto/)
    s.push({ content: " on Friday" })
    await screen.findByText(/on Friday/)
    expect(viewport.scrollTop).toBe(5000)
  })

  it("on a computer, keeps a box of its own, which follows its last line", async () => {
    const s = controlled()
    panel({ selectedText: "We ship on Thursday.", initialAction: "improve", isSidebar: true })
    await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled(), { timeout: 3000 })
    s.push({ content: "We ship" })
    await screen.findByText("We ship")
    const answer = document.querySelector<HTMLElement>("[data-ai-answer]")!
    expect(answer.className).toContain("max-h-[350px]")
    tall(answer)
    s.push({ content: " on Friday" })
    await screen.findByText(/on Friday/)
    expect(answer.scrollTop).toBe(5000)
  })
})

// In a narrow window the right panel is a sheet over the page
// (LayoutContent: OverlaySheet, escape="own"), which hands Esc on unused to
// what is in it. The panel skipped a press marked that way: Esc stopped no
// run, and went on to the page's own Esc (following someone, a list's
// selection). Its keys are the same as beside the page: one press, one thing.
describe("the panel in a narrow window's right panel", () => {
  it("stops on Esc, then goes back, then closes the panel, and the page hears none of it", async () => {
    const page = vi.fn(() => true)
    const stopPage = onEscape("page", page)
    const actions: Array<{ type: string }> = []
    const record: Middleware = () => (next) => (action) => {
      actions.push(action as { type: string })
      return next(action)
    }
    const store = configureStore({ reducer: { ui: (st: Record<string, unknown> = {}) => st }, middleware: (defaults) => defaults().concat(record) })
    const closed = () => actions.filter((a) => a.type === "rightPanel/closeRightPanel").length
    try {
      const s = controlled()
      render(
        <Provider store={store}>
          <TooltipProvider>
            <OverlaySheet open onClose={() => {}} label="Side panel" escape="own">
              <DocAiAssistantPanel selectedText="We ship on Thursday." docId="d1" initialAction="improve" isSidebar />
            </OverlaySheet>
          </TooltipProvider>
        </Provider>,
      )
      await vi.waitFor(() => expect(streamFetch).toHaveBeenCalled(), { timeout: 3000 })
      s.push({ content: "We ship" })
      const words = await screen.findByText("We ship")
      fireEvent.keyDown(words, { key: "Escape" })
      await settle()
      expect(screen.queryByRole("button", { name: /Stop/ })).toBeNull()
      fireEvent.keyDown(screen.getByText("We ship"), { key: "Escape" })
      expect(screen.getByRole("button", { name: /Improve writing/ })).toBeTruthy()
      expect(closed()).toBe(0)
      fireEvent.keyDown(screen.getByRole("button", { name: /Improve writing/ }), { key: "Escape" })
      expect(closed()).toBe(1)
      expect(page).not.toHaveBeenCalled()
    } finally {
      stopPage()
    }
  })
})
