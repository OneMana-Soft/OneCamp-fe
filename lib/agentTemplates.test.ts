import { describe, expect, it } from "vitest"
import { AGENT_TEMPLATES, scheduleDaysFor } from "./agentTemplates"
import { EVENT_TRIGGER_OPTIONS, TOOL_CATALOG } from "@/services/agentService"

const known = new Set(TOOL_CATALOG.flatMap((g) => g.tools.map((t) => t.name)))
const writes = new Set(TOOL_CATALOG.flatMap((g) => g.tools.filter((t) => t.write).map((t) => t.name)))

describe("agent templates", () => {
  it("name only tools the catalog has", () => {
    for (const t of AGENT_TEMPLATES) {
      for (const tool of t.tools) expect(known.has(tool), `${t.id}: unknown tool ${tool}`).toBe(true)
    }
  })

  it("ask before changing work, unless the only change is posting a report", () => {
    for (const t of AGENT_TEMPLATES) {
      const changes = t.tools.filter((x) => writes.has(x) && x !== "send_message")
      if (changes.length > 0) expect(t.autonomy, `${t.id} changes work without approval`).toBe("approval")
    }
  })

  it("use only events the trigger supports, and have unique ids", () => {
    const events = new Set(EVENT_TRIGGER_OPTIONS.map((o) => o.value))
    for (const t of AGENT_TEMPLATES) {
      if (t.trigger.type === "event") expect(events.has(t.trigger.event)).toBe(true)
    }
    expect(new Set(AGENT_TEMPLATES.map((t) => t.id)).size).toBe(AGENT_TEMPLATES.length)
  })

  it("maps schedule days onto the form", () => {
    expect(scheduleDaysFor("weekdays")).toEqual({ mode: "weekdays", weekdays: [] })
    expect(scheduleDaysFor(["MO"])).toEqual({ mode: "custom", weekdays: ["MO"] })
  })
})
