import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The palette's Ask view (design v3, shell P2): it streams the answer with a
// caret, lists the sources it read as chips that open them, says where the
// answer came from, and carries the conversation into the AI panel on ⌘⏎.

const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useDispatch: () => dispatch }))

const stream = {
  isStreaming: false,
  streamText: "",
  error: null as string | null,
  askStream: vi.fn(),
}
vi.mock("@/services/aiService", () => ({ useAskAIStream: () => stream }))
const remember = vi.fn()
vi.mock("@/lib/ai/lastConversation", () => ({ rememberConversation: (id: string) => remember(id) }))

import { PaletteAskView, sourceHref, sourceLabel, withBold } from "@/components/ai/PaletteAsk"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"

const props = { query: "what blocks the launch?", askNonce: 0, continueNonce: 0, selfId: "me", onNavigate: vi.fn(), onContinued: vi.fn() }

beforeEach(() => {
  stream.isStreaming = false
  stream.streamText = ""
  stream.error = null
  stream.askStream.mockReset()
  dispatch.mockClear()
  remember.mockClear()
  props.onNavigate.mockClear()
  props.onContinued.mockClear()
})
afterEach(cleanup)

describe("the palette's Ask view", () => {
  it("asks once per Enter, never on mount without one", async () => {
    stream.askStream.mockResolvedValue({ sessionId: "s1", text: "Only the load test.", actions: [], sources: [], notice: "" })
    const { rerender } = render(<PaletteAskView {...props} />)
    expect(stream.askStream).not.toHaveBeenCalled()
    await act(async () => rerender(<PaletteAskView {...props} askNonce={1} />))
    expect(stream.askStream).toHaveBeenCalledWith("what blocks the launch?", undefined)
  })

  it("streams with the agent caret, then shows the sources and the provenance line", async () => {
    let finish: (v: unknown) => void = () => {}
    stream.askStream.mockReturnValue(new Promise((r) => (finish = r)))
    const { rerender } = render(<PaletteAskView {...props} />)
    stream.isStreaming = true
    stream.streamText = "Only the load test"
    await act(async () => rerender(<PaletteAskView {...props} askNonce={1} />))
    expect(screen.getByText(/Only the load test/)).toBeTruthy()
    expect(document.querySelector(".palette-caret")).toBeTruthy()

    stream.isStreaming = false
    await act(async () =>
      finish({
        sessionId: "s1",
        text: "Only the load test.",
        actions: [],
        notice: "",
        sources: [
          { content_type: "post", content_uuid: "p9", channel_uuid: "c1", channel_name: "engineering" },
          { content_type: "task", content_uuid: "t9", snippet: "Plan the load test" },
        ],
      }),
    )
    rerender(<PaletteAskView {...props} askNonce={1} />)
    expect(document.querySelector(".palette-caret")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "engineering" }))
    expect(props.onNavigate).toHaveBeenCalledWith("/app/channel/c1/p9")
    expect(screen.getByText("Answered from what you can open · on the record")).toBeTruthy()
  })

  it("thinks with three dots before the first words", async () => {
    stream.askStream.mockReturnValue(new Promise(() => {}))
    const { rerender } = render(<PaletteAskView {...props} />)
    stream.isStreaming = true
    await act(async () => rerender(<PaletteAskView {...props} askNonce={1} />))
    expect(document.querySelector(".palette-dots")).toBeTruthy()
    expect(screen.getByText("Reading what you can open…")).toBeTruthy()
  })

  it("says it couldn't answer, with Retry, and never shows red", async () => {
    stream.askStream.mockResolvedValue(null)
    const { rerender } = render(<PaletteAskView {...props} />)
    stream.error = "AI request failed"
    await act(async () => rerender(<PaletteAskView {...props} askNonce={1} />))
    expect(screen.getByRole("alert").textContent).toMatch(/OneCamp AI couldn.t answer/)
    expect(screen.getByRole("button", { name: /Retry/ })).toBeTruthy()
  })

  it("says it couldn't answer when the answer comes back empty, never the provenance line alone", async () => {
    stream.askStream.mockResolvedValue({ sessionId: "s1", text: "", actions: [], sources: [], notice: "" })
    const { rerender } = render(<PaletteAskView {...props} />)
    await act(async () => rerender(<PaletteAskView {...props} askNonce={1} />))
    expect(screen.getByRole("alert").textContent).toMatch(/OneCamp AI couldn.t answer/)
    expect(screen.queryByText("Answered from what you can open · on the record")).toBeNull()
  })

  it("⌘⏎ hands the conversation to the AI panel", async () => {
    stream.askStream.mockResolvedValue({ sessionId: "s1", text: "Yes.", actions: [], sources: [], notice: "" })
    const { rerender } = render(<PaletteAskView {...props} />)
    await act(async () => rerender(<PaletteAskView {...props} askNonce={1} />))
    await act(async () => rerender(<PaletteAskView {...props} askNonce={1} continueNonce={1} />))
    expect(remember).toHaveBeenCalledWith("s1")
    expect(dispatch).toHaveBeenCalledWith(openRightPanel({ aiChatOpen: true }))
    expect(props.onContinued).toHaveBeenCalled()
  })

  it("⌘⏎ before asking asks first, then moves the answer to the panel", async () => {
    stream.askStream.mockResolvedValue({ sessionId: "s2", text: "Yes.", actions: [], sources: [], notice: "" })
    const { rerender } = render(<PaletteAskView {...props} />)
    await act(async () => rerender(<PaletteAskView {...props} continueNonce={1} />))
    expect(stream.askStream).toHaveBeenCalled()
    expect(remember).toHaveBeenCalledWith("s2")
    expect(dispatch).toHaveBeenCalledWith(openRightPanel({ aiChatOpen: true }))
  })
})

describe("a source chip", () => {
  it("opens what it names", () => {
    expect(sourceHref({ content_type: "doc", content_uuid: "d1" })).toBe("/app/doc/d1")
    expect(sourceHref({ content_type: "chat", content_uuid: "x", chat_grp_id: "g".repeat(32) })).toBe(`/app/chat/group/${"g".repeat(32)}`)
    expect(sourceHref({ content_type: "comment", content_uuid: "x", task_uuid: "t1" })).toBe("/app/task/t1")
    expect(sourceLabel({ content_type: "task", content_uuid: "t", snippet: "Plan the load test for the launch week" })).toBe("Plan the load test for the…")
  })
})

describe("the answer's Markdown", () => {
  it("draws **bold** as weight, not asterisks", () => {
    const { container } = render(<p>{withBold("Only the **load test** is left.")}</p>)
    expect(container.textContent).toBe("Only the load test is left.")
    expect(container.querySelector("b")?.textContent).toBe("load test")
  })
})

describe("the Ask view's gate", () => {
  it("is AI-only: its default export gates itself", () => {
    const src = readFileSync(resolve(__dirname, "PaletteAsk.tsx"), "utf8")
    expect(src).toMatch(/const PaletteAsk = withAI\(PaletteAskView\)\nexport default PaletteAsk/)
  })
})
