import { describe, expect, it } from "vitest"

import type { AIActivityItem } from "@/services/aiActivityService"
import { recordActor, sourceWords, startedByWords } from "@/components/ai/agentRecord"

/**
 * The agents record named no agent on the demo: every row read "An agent acted
 * as you". These are the demo's own rows (/ai/activity, 11 Oct), and the
 * shapes the record carries for runs and for rows that name their agent.
 */
const drillRefused: AIActivityItem = {
  kind: "audit",
  title: "agent.drill.refused",
  actor: "visitor@demo.onemana.dev",
  summary: "Drill: post in #drill-finance refused (you are not a member of this channel)",
  status: "refused",
  source: "agent",
  at: "2026-10-10T06:49:11.7125Z",
  seq: 46,
  initiator: "person",
}

describe("who acted, in the agents record", () => {
  it("names the governance drill as the drill, never as 'An agent'", () => {
    const who = recordActor(drillRefused)
    expect(who.name).toBe("The governance drill")
    expect(who.named).toBe(true)
    expect(who.drill).toBe(true)
  })

  it("names an agent run by its agent", () => {
    const run: AIActivityItem = { kind: "agent_run", title: "Release Captain", summary: "6 steps", at: "2026-10-10T06:00:00Z", agent_id: "ag-1" }
    expect(recordActor(run)).toMatchObject({ name: "Release Captain", named: true, key: "ag-1" })
  })

  it("names an audit row by the agent the server sends", () => {
    const row: AIActivityItem = { kind: "audit", title: "mcp.tool_call.refused", summary: "post refused", at: "2026-10-10T06:00:00Z", agent_name: "Release Captain", agent_id: "ag-1" }
    expect(recordActor(row).name).toBe("Release Captain")
  })

  it("names an audit row by one of the reader's own agents when only the id came", () => {
    const row: AIActivityItem = { kind: "audit", title: "agent.tool.allowed", summary: "", at: "2026-10-10T06:00:00Z", agent_id: "ag-2" }
    expect(recordActor(row, new Map([["ag-2", "Inbox Sweeper"]])).name).toBe("Inbox Sweeper")
  })

  it("calls the assistant by its name", () => {
    expect(recordActor({ kind: "audit", title: "ai.web_search", summary: "", at: "x" }).name).toBe("OneCamp AI")
  })

  it("says 'An agent' only when nothing names it, and '(removed)' for a run whose agent is gone", () => {
    expect(recordActor({ kind: "audit", title: "agent.tool.allowed", summary: "", at: "x" })).toMatchObject({ name: "An agent", named: false })
    expect(recordActor({ kind: "agent_run", title: "", summary: "", at: "x", agent_id: "gone" }).name).toBe("An agent (removed)")
  })
  it("reads the keys the server sends since 11 Oct: agent_name on a run as well", () => {
    const run: AIActivityItem = { kind: "agent_run", title: "", agent_name: "Release Captain", agent_id: "ag-1", run_id: "r-1", summary: "", at: "x" }
    expect(recordActor(run)).toMatchObject({ name: "Release Captain", named: true })
    const row: AIActivityItem = { kind: "audit", title: "mcp.tool_call.refused", agent_name: "Release Captain", agent_id: "ag-1", actor_kind: "agent", summary: "", at: "x" }
    expect(recordActor(row).name).toBe("Release Captain")
  })
})

// The evidence read "Started by: person" and "Source: agent", the audit
// row's own codes.
describe("the evidence, in words (AI15)", () => {
  it("says who started it and where it came from as a person would", () => {
    expect(startedByWords("person")).toBe("A person")
    expect(startedByWords("schedule")).toBe("A schedule, nobody watching")
    expect(startedByWords(undefined)).toBe("")
    expect(sourceWords("agent")).toBe("An agent")
    // A code it does not know is shown as it came, never hidden.
    expect(startedByWords("webhook")).toBe("webhook")
    expect(sourceWords("custom.thing")).toBe("custom.thing")
  })
})
