import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

import { RunRow, toolCallTone } from "@/components/admin/AgentRunsDialog"
import type { AgentRun } from "@/services/agentService"

// Design v3, admin §A23: a run opens to a step timeline. Each tool call is a
// 20px node on one rail, moss when it did its work, danger when it failed or
// was refused, ink-3 when it was skipped or waits for a person; the tool is
// named in mono. Each call used to be a bordered grey box of badges, and the
// run's order was only the order of the boxes. The run's state is a glyph and
// a word, never a coloured pill.

const STEPS = JSON.stringify([
  {
    iteration: 1,
    assistant: "Reading the channel.",
    tool_calls: [
      { tool: "read_channel", params: {}, result: "12 messages", duration_ms: 820 },
      { tool: "send_message", params: {}, error: "the channel is archived" },
      { tool: "post_leadership", params: {}, skipped: "not a member", governance: "blocked" },
      { tool: "delete_task", params: {}, skipped: "waiting", governance: "approval_required" },
    ],
  },
])

const run: AgentRun = {
  id: "r1", agent_id: "a1", trigger_source: "manual", status: "failed",
  steps: STEPS, step_count: 1, tokens: 40, started_at: "2026-10-11T10:00:00Z", ended_at: "2026-10-11T10:00:04Z",
}

afterEach(cleanup)

describe("a run's step timeline", () => {
  it("says the run's state as a word beside a glyph, and opens in place", () => {
    const { getByRole, container } = render(<RunRow run={run} currentSkills={new Map()} />)
    const head = getByRole("button")
    expect(head.textContent).toContain("Failed")
    expect(head.getAttribute("aria-expanded")).toBe("false")
    expect(container.querySelector(".ai-steps")).toBeNull()
    fireEvent.click(head)
    expect(head.getAttribute("aria-expanded")).toBe("true")
    expect(container.querySelector("ol.ai-steps")).toBeTruthy()
  })

  it("puts every tool call on a node whose tone says what happened", () => {
    const { getByRole, container } = render(<RunRow run={run} currentSkills={new Map()} />)
    fireEvent.click(getByRole("button"))
    const tones = [...container.querySelectorAll("[data-tool-call]")].map(
      (c) => (c.closest("[data-step-node]") as HTMLElement).dataset.tone,
    )
    expect(tones).toEqual(["ok", "fail", "fail", "idle"])
    expect(container.querySelectorAll(".ai-node")).toHaveLength(5)
  })

  it("names each tool in mono, with its time when the server recorded one", () => {
    const { getByRole, container } = render(<RunRow run={run} currentSkills={new Map()} />)
    fireEvent.click(getByRole("button"))
    const first = container.querySelector("[data-tool-call]") as HTMLElement
    expect(first.querySelector("code.font-mono")?.textContent).toBe("read_channel")
    expect(first.textContent).toContain("820ms")
  })

  it("draws no bordered boxes and no pills", () => {
    const { getByRole, container } = render(<RunRow run={run} currentSkills={new Map()} />)
    fireEvent.click(getByRole("button"))
    expect(container.innerHTML).not.toMatch(/\bborder border-border/)
    expect(container.querySelector("[data-slot='badge'], .rounded-full.border")).toBeNull()
  })

  it("treats a refusal as danger and an approval wait as neither", () => {
    expect(toolCallTone({ tool: "x", params: {}, governance: "blocked" })).toBe("fail")
    expect(toolCallTone({ tool: "x", params: {}, governance: "approval_required" })).toBe("idle")
    expect(toolCallTone({ tool: "x", params: {}, result: "ok" })).toBe("ok")
  })
})
