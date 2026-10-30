import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import React from "react"

// The AI panel, with only the network faked: the real askStream and
// authedStreamFetch.

vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: { data: { aiContextType: "" } } } }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
vi.mock("@/components/common/withFeature", () => ({ withAI: <P extends object>(C: React.ComponentType<P>) => C }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, toggle: vi.fn(), setup: { progress: null } }),
  dictationLabel: () => "Dictate",
}))
// The panel's furniture: menus and dialogs this path never opens.
const none = () => null
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: ({ content }: { content: string }) => <div>{content}</div> }))
vi.mock("@/components/ai/ActionConfirmation", () => ({ default: none }))
vi.mock("@/components/ai/AiModelPicker", () => ({ default: none }))
vi.mock("@/components/ai/AiUsageIndicator", () => ({ default: none }))
vi.mock("@/components/ai/ReleaseNotesDialog", () => ({ default: none }))
vi.mock("@/components/ai/AiInstructionsDialog", () => ({ default: none }))
vi.mock("@/components/ai/MyAgentWorkDialog", () => ({ default: none }))
vi.mock("@/components/ai/SocialComposeDialog", () => ({ default: none }))
vi.mock("@/components/ai/AiScheduleDialog", () => ({ default: none }))
vi.mock("@/components/ai/AgentTeammatesMenuItem", () => ({ AgentTeammatesMenuItem: none }))
vi.mock("@/components/ai/ChatHistoryMenu", () => ({ ChatHistoryMenu: none }))
// The empty panel's starter questions read the day from "what needs me".
vi.mock("@/services/memoryService", () => ({ getAttention: vi.fn().mockResolvedValue({ enabled: true, items: [], counts: {} }) }))

// jsdom lays nothing out, so it has no scrolling; the panel scrolls to its newest line.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}

const { default: AiChatPanel } = await import("@/components/ai/AiChatPanel")

/** What the server streams: one SSE event per chunk, as the backend writes them. */
function stream(...events: string[]) {
  const encoder = new TextEncoder()
  let i = 0
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: {
      getReader: () => ({
        read: async () =>
          i < events.length ? { done: false, value: encoder.encode(`data: ${events[i++]}\n\n`) } : { done: true, value: undefined },
        cancel: () => undefined,
      }),
    },
  }
}

let calls: string[] = []
function serverAnswers(response: unknown) {
  calls = []
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url))
    return response
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("a question the page arrived with (?ask= from search)", () => {
  it("is asked once, even when the panel renders again", async () => {
    serverAnswers(stream('{"content":"Thursday."}', '{"done":true}'))
    let rerender: (ui: React.ReactElement) => void = () => {}
    await act(async () => {
      ;({ rerender } = render(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    })
    await screen.findByText("Thursday.")
    await act(async () => rerender(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    expect(calls.filter((u) => u.endsWith("/ai/ask/stream"))).toHaveLength(1)
    expect(screen.getAllByText("When is the launch?")).toHaveLength(1)
  })
})

describe("a question the page arrived with (?ask= from search)", () => {
  it("is asked once, even when the panel renders again", async () => {
    serverAnswers(stream('{"content":"Thursday."}', '{"done":true}'))
    let rerender: (ui: React.ReactElement) => void = () => {}
    await act(async () => {
      ;({ rerender } = render(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    })
    await screen.findByText("Thursday.")
    await act(async () => rerender(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    expect(calls.filter((u) => u.endsWith("/ai/ask/stream"))).toHaveLength(1)
    expect(screen.getAllByText("When is the launch?")).toHaveLength(1)
  })
})

describe("a question the page arrived with (?ask= from search)", () => {
  it("is asked once, even when the panel renders again", async () => {
    serverAnswers(stream('{"content":"Thursday."}', '{"done":true}'))
    let rerender: (ui: React.ReactElement) => void = () => {}
    await act(async () => {
      ;({ rerender } = render(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    })
    await screen.findByText("Thursday.")
    await act(async () => rerender(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    expect(calls.filter((u) => u.endsWith("/ai/ask/stream"))).toHaveLength(1)
    expect(screen.getAllByText("When is the launch?")).toHaveLength(1)
  })
})

describe("a question the page arrived with (?ask= from search)", () => {
  it("is asked once, even when the panel renders again", async () => {
    serverAnswers(stream('{"content":"Thursday."}', '{"done":true}'))
    let rerender: (ui: React.ReactElement) => void = () => {}
    await act(async () => {
      ;({ rerender } = render(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    })
    await screen.findByText("Thursday.")
    await act(async () => rerender(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    expect(calls.filter((u) => u.endsWith("/ai/ask/stream"))).toHaveLength(1)
    expect(screen.getAllByText("When is the launch?")).toHaveLength(1)
  })
})

describe("a question the page arrived with (?ask= from search)", () => {
  it("is asked once, even when the panel renders again", async () => {
    serverAnswers(stream('{"content":"Thursday."}', '{"done":true}'))
    let rerender: (ui: React.ReactElement) => void = () => {}
    await act(async () => {
      ;({ rerender } = render(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    })
    await screen.findByText("Thursday.")
    await act(async () => rerender(<AiChatPanel variant="page" initialAsk="When is the launch?" />))
    expect(calls.filter((u) => u.endsWith("/ai/ask/stream"))).toHaveLength(1)
    expect(screen.getAllByText("When is the launch?")).toHaveLength(1)
  })
})
