import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { PlanElicitation, PlanSteps, planSummary, type PlanStep } from "@/components/ai/PlanSteps"

/** hub.md AI7: the steps behind an answer. */
const steps: PlanStep[] = [
  { id: "1", text: "Searched messages for 'launch' · 12 results", state: "done", ms: 800 },
  { id: "2", text: "Read Q4 launch plan", state: "done", ms: 400 },
  { id: "3", text: "Checked Sam's permission to post in #drill-finance → not a member", state: "refused", ms: 100 },
  { id: "4", text: "Drafting the answer", state: "running" },
]

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.sessionStorage.clear()
})

describe("plan steps", () => {
  it("draws one glyph per state, and a refusal in the agent's tint, never danger", () => {
    const { container } = render(<PlanSteps steps={[...steps, { id: "5", text: "Posting", state: "failed" }]} running answering={false} />)
    expect(container.querySelector('[data-step-glyph="done"]')).toBeTruthy()
    expect(container.querySelector('[data-step-glyph="running"]')).toBeTruthy()
    const refused = container.querySelector('[data-step-glyph="refused"]')!
    expect(refused.className).toContain("bg-agent-muted")
    expect(refused.className).not.toMatch(/danger|destructive/)
    expect(container.querySelector('[data-step-glyph="failed"]')?.className).toContain("text-danger-ink")
  })

  it("says where it is while working, and sums up after", () => {
    expect(planSummary(steps, true)).toBe("Working · step 4 of 4")
    expect(planSummary(steps, false)).toBe("Worked through 4 steps")
    render(<PlanSteps steps={steps.slice(0, 2)} running={false} answering />)
    expect(screen.getByText("· 1.2 s")).toBeTruthy()
  })

  it("folds 400 ms after the answer starts, and a reopen sticks for the session", () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<PlanSteps steps={steps} running answering={false} />)
    expect(container.querySelector("[data-plan]")?.hasAttribute("data-open")).toBe(true)
    rerender(<PlanSteps steps={steps} running answering />)
    act(() => vi.advanceTimersByTime(399))
    expect(container.querySelector("[data-plan]")?.hasAttribute("data-open")).toBe(true)
    act(() => vi.advanceTimersByTime(2))
    expect(container.querySelector("[data-plan]")?.hasAttribute("data-open")).toBe(false)
    fireEvent.click(screen.getByRole("button", { expanded: false }))
    expect(window.sessionStorage.getItem("ai-plan-open")).toBe("1")
  })

  it("shows nothing when the server sent no steps", () => {
    const { container } = render(<PlanSteps steps={[]} running answering={false} />)
    expect(container.innerHTML).toBe("")
  })

  it("asks the person with options, or a short answer", () => {
    const onAnswer = vi.fn()
    render(<PlanElicitation question="Which environment?" options={["staging", "production"]} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole("button", { name: "staging" }))
    expect(onAnswer).toHaveBeenCalledWith("staging")
    cleanup()
    render(<PlanElicitation question="What should I call the branch?" onAnswer={onAnswer} />)
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeTruthy()
  })
})
