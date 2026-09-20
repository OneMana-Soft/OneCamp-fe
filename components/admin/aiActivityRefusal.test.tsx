import { describe, expect, it, afterEach } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { AIActivityRow } from "@/components/admin/AIActivityCard"
import type { AIActivityItem } from "@/services/aiActivityService"

afterEach(cleanup)

const item = (over: Partial<AIActivityItem> = {}): AIActivityItem => ({
  kind: "audit",
  title: "mcp.tool_call.refused",
  summary: "the caller is not a member of this channel",
  at: new Date().toISOString(),
  ...over,
})

describe("a refusal in the activity feed", () => {
  // The product's central claim is that an agent is stopped when the person
  // behind it could not have done the thing. Filed beside a crashed run, that
  // reads as a fault, and an admin learns to ignore both.
  it("is not presented as a failure", () => {
    const { container } = render(<AIActivityRow item={item({ status: "refused" })} />)
    // Exactly the status label: the ACTION name also contains "refused"
    // (mcp.tool_call.refused), and matching loosely found the title instead.
    const el = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "refused by permissions",
    )
    expect(el, "no refused status rendered").toBeTruthy()
    expect(el?.className).not.toContain("text-destructive")
    expect(el?.className).toContain("text-brand")
  })

  // Colour alone never carries it.
  it("says why in words", () => {
    const { container } = render(<AIActivityRow item={item({ status: "refused" })} />)
    expect((container.textContent || "")).toContain("refused by permissions")
  })

  it("still paints a real failure as one", () => {
    const { container } = render(<AIActivityRow item={item({ title: "ai.run", status: "failed" })} />)
    const el = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "failed")
    expect(el?.className).toContain("text-destructive")
  })

  it("treats an allowed call as the system working", () => {
    const { container } = render(<AIActivityRow item={item({ title: "mcp.tool_call.allowed", status: "allowed" })} />)
    const el = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "allowed")
    expect(el?.className).toContain("text-success")
  })
})

// WHICH LINE IS THE SENTENCE. The two kinds of row carry different things in
// `title`: an agent run carries the agent's name, an audit row carries a
// dotted action like agent.drill.refused. The action used to be the boldest
// text on the line while the sentence explaining what happened sat underneath
// in small muted grey, which is the wrong way round for everyone who reads
// this feed and especially for a member, who cannot open the log at all.
describe("what a row leads with", () => {
  it("leads an audit row with the sentence, not the action name", () => {
    const { container } = render(
      <AIActivityRow
        item={item({
          kind: "audit",
          title: "agent.drill.refused",
          summary: "Drill: post in #drill-finance refused (you are not a member of this channel)",
          status: "refused",
        })}
      />,
    )
    const headline = container.querySelector("span.text-sm.font-medium")
    expect(headline?.textContent).toContain("you are not a member of this channel")
    expect(headline?.textContent).not.toContain("agent.drill.refused")
  })

  it("still carries the exact action, for anybody matching it against the log", () => {
    const { container } = render(
      <AIActivityRow
        item={item({ kind: "audit", title: "agent.drill.refused", summary: "Drill: post refused", status: "refused" })}
      />,
    )
    const ref = Array.from(container.querySelectorAll("p")).find((p) =>
      p.className.includes("font-mono"),
    )
    expect(ref?.textContent).toBe("agent.drill.refused")
  })

  it("leaves an agent run alone, because its title is a name a person chose", () => {
    const { container } = render(
      <AIActivityRow
        item={item({ kind: "agent_run", title: "Weekly digest", summary: "Posted to #engineering", status: "succeeded" })}
      />,
    )
    const headline = container.querySelector("span.text-sm.font-medium")
    expect(headline?.textContent).toBe("Weekly digest")
    expect(container.textContent).toContain("Posted to #engineering")
  })

  it("falls back to the action when a row has no sentence", () => {
    const { container } = render(
      <AIActivityRow item={item({ kind: "audit", title: "ai.config.changed", summary: "", status: "" })} />,
    )
    expect(container.querySelector("span.text-sm.font-medium")?.textContent).toBe("ai.config.changed")
  })
})
