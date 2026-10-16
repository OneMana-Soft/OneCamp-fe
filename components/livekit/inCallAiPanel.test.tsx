import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The in-call assistant (hub.md C10) is the AI's own components in dark. It
// had grown its own: a brand sparkle where the AI is agent identity, questions
// in raw Tailwind blue, answers in bordered bubbles, spinners for thinking and
// for Stop, and a composer of its own.

const getStatus = vi.fn(async () => ({ enabled: true, provider: "ollama", model: "qwen3" }))
vi.mock("@/services/aiService", () => ({ useAIStatus: () => ({ getStatus }) }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: ({ content }: { content: string }) => <p data-answer="">{content}</p> }))

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}

const { InCallAIPanel } = await import("@/components/livekit/InCallAIPanel")

afterEach(cleanup)

const props = { isStreaming: false, onAsk: () => {}, onCancel: () => {}, onClose: () => {} }

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
