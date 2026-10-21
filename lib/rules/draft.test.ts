import { describe, expect, it } from "vitest"
import { BLANK_DRAFT, draftFromTemplate, draftProblem, newAction, newCondition, savedIn } from "@/lib/rules/draft"

describe("a rule's draft", () => {
  it("says what's missing, one thing at a time", () => {
    expect(draftProblem(BLANK_DRAFT)).toBe("Name the rule.")
    const named = { ...BLANK_DRAFT, name: "Triage" }
    expect(draftProblem(named)).toBe("")
    expect(draftProblem({ ...named, actions: [] })).toBe("Add something for the rule to do.")
    expect(draftProblem({ ...named, actions: [newAction("add_comment")] })).toBe("Write the comment.")
    expect(draftProblem({ ...named, conditions: { items: [{ ...newCondition("due"), value: "soon" }] } })).toBe("Say the due date's days as a number.")
    expect(draftProblem({ ...named, else_actions: [{ type: "notify", notify: "people", text: "x", user_ids: [] }] })).toBe("Pick who to tell.")
  })

  it("starts a ready-made rule as a copy, so editing it never changes the catalogue", () => {
    const t = { key: "k", name: "N", description: "", hue: "sky", trigger_type: "task_created" as const, conditions: { items: [newCondition("priority")] }, actions: [newAction("set_due")] }
    const d = draftFromTemplate(t)
    d.actions[0].due_in_days = 9
    d.conditions.items![0].value = "low"
    expect(t.actions[0].due_in_days).toBe(3)
    expect(t.conditions.items[0].value).toBe("high")
  })

  it("saves in the zone of whoever saves it, keeping the rest of its trigger", () => {
    const d = { ...BLANK_DRAFT, name: "Raised", trigger_type: "task_field_changed" as const, trigger_config: { fields: ["priority" as const], tz: "Europe/London" } }
    const sent = savedIn(d, "Asia/Kolkata")
    expect(sent.trigger_config).toEqual({ fields: ["priority"], tz: "Asia/Kolkata" })
    expect(d.trigger_config.tz).toBe("Europe/London")
  })
})
