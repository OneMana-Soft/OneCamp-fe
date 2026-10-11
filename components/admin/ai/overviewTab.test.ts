import { describe, expect, it } from "vitest"
import { countActivity, statusLine } from "@/components/admin/ai/tabs/OverviewTab"

// The Overview's status line and its numbers come from real data (design v3,
// admin §A15): the chat and search models from the settings, active agents
// from the inventory, runs today and refusals this week from the AI activity
// feed. Nothing on the card is a placeholder.
describe("the AI overview's words and numbers", () => {
  it("names the chat model, the search model and the agents at work", () => {
    expect(statusLine({ chat_model: "claude-sonnet", embedding_model: "nomic-embed-text" } as never, 4)).toBe(
      "claude-sonnet for chat · nomic-embed-text for search · 4 agents active",
    )
    expect(statusLine({ chat_model: "", embedding_model: "" } as never, null)).toBe("No chat model yet")
  })

  it("counts agent runs since midnight and refusals in the last seven days", () => {
    const now = new Date("2026-10-11T15:00:00")
    const items = [
      { kind: "agent_run", at: "2026-10-11T09:00:00", status: "succeeded" },
      { kind: "agent_run", at: "2026-10-10T23:00:00", status: "succeeded" },
      { kind: "audit", at: "2026-10-09T10:00:00", status: "refused" },
      { kind: "audit", at: "2026-10-01T10:00:00", status: "refused" },
    ]
    expect(countActivity(items as never, now)).toEqual({ runsToday: 1, refusalsWeek: 1 })
  })
})
