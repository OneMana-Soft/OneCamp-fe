import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { clockTime } from "@/lib/utils/date/clock"

// The in-call assistant (hub.md C10) is the AI's own components in dark. It
// had grown its own: a brand sparkle where the AI is agent identity, questions
// in raw Tailwind blue, answers in bordered bubbles, spinners for thinking and
// for Stop, and a composer of its own.

const getStatus = vi.fn(async () => ({ enabled: true, provider: "ollama", model: "qwen3" }))
vi.mock("@/services/aiService", () => ({ useAIStatus: () => ({ getStatus }) }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: ({ content }: { content: string }) => <p data-answer="">{content}</p> }))

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}

const { InCallAIPanel } = await import("@/components/livekit/InCallAIPanel")
const { CALL_PANEL_FOOT } = await import("@/components/livekit/callPanelClasses")

afterEach(cleanup)

// The transcript has run for five minutes while this screen was in the call.
const props = { isStreaming: false, onAsk: () => {}, onCancel: () => {}, onClose: () => {}, hearing: { on: true, from: Date.now() - 5 * 60_000 } }
const SUGGESTION = { name: "What did we decide?" }

describe("the in-call AI panel (hub.md C10)", () => {
  it("greets with the agent's mark and the suggestions, then asks with the AI's composer", async () => {
    const onAsk = vi.fn()
    render(<InCallAIPanel {...props} items={[]} onAsk={onAsk} />)
    await act(async () => {})
    const empty = document.querySelector("[data-in-call-empty]")!
    expect(empty.querySelector("[data-ai-mark]")).toBeTruthy()
    screen.getByRole("button", { name: "What did we decide?" }).click()
    expect(onAsk).toHaveBeenCalledWith("What did we decide?")
    expect(document.querySelector("[data-ai-composer]")).toBeTruthy()
    expect(screen.getByPlaceholderText("Ask about this call…")).toBeTruthy()
  })

  it("puts your question in the neutral bubble and the answer flat beside the mark, breathing while it thinks", async () => {
    const items = [
      { id: "1", question: "What did we decide?", askedByName: "Sam", mine: true, answer: "", streaming: true },
      { id: "2", question: "Who owns the post?", askedByName: "Maya Chen", mine: false, answer: "Jonas does.", streaming: false },
    ]
    render(<InCallAIPanel {...props} items={items} isStreaming />)
    await act(async () => {})
    const [thinking, answered] = document.querySelectorAll("[data-in-call-item]")
    expect(thinking.querySelector(".ai-user-bubble")?.textContent).toBe("What did we decide?")
    expect(thinking.querySelector("[data-ai-mark][data-breathing]")).toBeTruthy()
    expect(thinking.textContent).toContain("Thinking…")
    expect(answered.textContent).toContain("Maya Chen asked")
    expect(answered.querySelector("[data-ai-mark][data-breathing]")).toBeNull()
    expect(answered.querySelector("[data-answer]")?.closest("[class*='border']")).toBeNull()
    // Stop is the composer's ink square, not a spinner.
    expect(screen.getByRole("button", { name: "Stop generating" })).toBeTruthy()
  })

  it("has no spinner, no brand sparkle and no colour from outside the system", () => {
    const src = readFileSync(resolve(__dirname, "InCallAIPanel.tsx"), "utf8")
    expect(src).not.toMatch(/Loader2|animate-spin|\b(?:bg|text)-blue-\d{3}\b|text-primary|Sparkles/)
  })
})

// It said "Listening · shared with everyone in the call" whatever it could
// hear, and offered "What did we decide?" in a call nobody was transcribing
// (CALLS-05): the answer was a guess, or "nothing has come up".
describe("what the in-call AI can hear (UX-CALLS-H2)", () => {
  /** The panel's line under its title: its state, and how long it has heard. */
  const hearingLine = () => document.querySelector("[data-in-call-hearing]")
  /** The part of it a screen reader hears as it changes: the state only (CR-B65 F2). */
  const hearingStatus = () => hearingLine()?.querySelector("[role=status]")

  afterEach(() => vi.useRealTimers())

  it("says Not listening yet with Turn on captions while no transcript runs, and offers no suggestions", async () => {
    const onTurnOn = vi.fn()
    render(<InCallAIPanel {...props} items={[]} hearing={{ on: false, onTurnOn }} />)
    await act(async () => {})
    expect(hearingLine()?.textContent).toBe("Not listening yet")
    expect(hearingStatus()?.textContent).toBe("Not listening yet")
    // The switch has the call's own name: the confirm it opens, the dock and the announcements all say captions.
    expect(screen.getByText("Turn on captions so I can follow the call. Everyone in it is told first.")).toBeTruthy()
    const turnOn = screen.getByRole("button", { name: "Turn on captions for everyone" })
    expect(turnOn.textContent).toBe("Turn on captions")
    fireEvent.click(turnOn)
    expect(onTurnOn).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/transcript/i)).toBeNull()
    expect(screen.queryByRole("button", SUGGESTION)).toBeNull()
    expect(screen.queryByText(/Listening/)).toBeNull()
  })

  it("says Listening · just started without suggestions, and once lines have come for 30 s how long it has heard, with them", async () => {
    render(<InCallAIPanel {...props} items={[]} hearing={{ on: true, from: Date.now() - 5_000 }} />)
    await act(async () => {})
    expect(hearingLine()?.textContent).toBe("Listening · just started")
    expect(screen.queryByRole("button", SUGGESTION)).toBeNull()
    expect(screen.getByPlaceholderText("Ask about this call…")).toBeTruthy()
    cleanup()

    render(<InCallAIPanel {...props} items={[]} hearing={{ on: true, from: Date.now() - 4 * 60_000 }} />)
    await act(async () => {})
    expect(hearingLine()?.textContent).toBe("Listening · 4 min heard")
    expect(screen.getByRole("button", SUGGESTION)).toBeTruthy()
  })

  it("moves off just started as the call goes on, with the panel open: the heard time and the suggestions come without opening it again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
    render(<InCallAIPanel {...props} items={[]} hearing={{ on: true, from: Date.now() - 5_000 }} />)
    await act(async () => {})
    expect(hearingLine()?.textContent).toBe("Listening · just started")
    expect(screen.queryByRole("button", SUGGESTION)).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(hearingLine()?.textContent).toMatch(/^Listening · (under a minute|1 min) heard$/)
    expect(screen.getByRole("button", SUGGESTION)).toBeTruthy()
  })

  it("announces the state only: the live region keeps its words from minute 4 to minute 5, and says it when Not listening becomes Listening", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
    const from = Date.now() - 4 * 60_000
    const { rerender } = render(<InCallAIPanel {...props} items={[]} hearing={{ on: false, onTurnOn: () => {} }} />)
    await act(async () => {})
    const status = hearingStatus()
    expect(status?.textContent).toBe("Not listening yet")
    rerender(<InCallAIPanel {...props} items={[]} hearing={{ on: true, from }} />)
    await act(async () => {})
    expect(hearingLine()?.textContent).toBe("Listening · 4 min heard")
    expect(hearingStatus()).toBe(status)
    expect(status?.textContent).toBe("Listening")
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(hearingLine()?.textContent).toBe("Listening · 5 min heard")
    // The minute changed outside the live region: nothing is announced over the call.
    expect(status?.textContent).toBe("Listening")
    expect(hearingLine()?.getAttribute("role")).toBeNull()
  })

  it("tells someone who came in late since when the call's transcript runs, with the suggestions", async () => {
    const since = Date.now() - 12 * 60_000
    render(<InCallAIPanel {...props} items={[]} hearing={{ on: true, from: since, kept: true }} />)
    await act(async () => {})
    expect(hearingLine()?.textContent).toBe(`Listening · transcript on since ${clockTime(since)}`)
    expect(screen.getByRole("button", SUGGESTION)).toBeTruthy()
  })

  it("says transcripts are off for the workspace, with no button and no suggestions", async () => {
    render(<InCallAIPanel {...props} items={[]} hearing={{ on: false }} />)
    await act(async () => {})
    expect(hearingLine()?.textContent).toBe("Not listening")
    expect(screen.getByText("Transcripts are off for this workspace, so I can't follow the call.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Turn on/ })).toBeNull()
    expect(screen.queryByRole("button", SUGGESTION)).toBeNull()
  })

  it("is a region a screen reader names, and its dot says listening by its words, not its colour alone", async () => {
    render(<InCallAIPanel {...props} items={[]} />)
    await act(async () => {})
    expect(screen.getByRole("complementary", { name: "Ask about this call" })).toBeTruthy()
    expect(hearingLine()?.textContent).toBe("Listening · 5 min heard")
  })

  it("ends in the side panels' foot: on a phone it covers the dock as the chat does, so its ask box is the screen's footer, clear of the home indicator", async () => {
    render(<InCallAIPanel {...props} items={[]} />)
    await act(async () => {})
    expect(document.querySelector("[data-ai-composer]")?.parentElement?.className).toBe(CALL_PANEL_FOOT)
  })
})

describe("an ask that fails (UX-CALLS-H2)", () => {
  const failed = (error: string, mine = true) => [{ id: "q1", question: "What did we decide?", askedByName: mine ? "You" : "Maya Chen", mine, answer: "", error, streaming: false }]

  it("says why and asks it again with Try again, for the person who asked", async () => {
    const onRetry = vi.fn()
    render(<InCallAIPanel {...props} items={failed("Couldn't reach the assistant. Check your connection.")} onRetry={onRetry} />)
    await act(async () => {})
    expect(screen.getByText("Couldn't reach the assistant. Check your connection.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledWith("q1")
  })

  it("offers no Try again on someone else's question, nor while an answer is coming", async () => {
    render(<InCallAIPanel {...props} items={failed("The answer didn't arrive (the asker may have left).", false)} onRetry={() => {}} />)
    await act(async () => {})
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    cleanup()
    render(<InCallAIPanel {...props} items={failed("Something went wrong.")} onRetry={() => {}} isStreaming />)
    await act(async () => {})
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })
})
