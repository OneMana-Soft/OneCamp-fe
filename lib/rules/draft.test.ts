import { describe, expect, it } from "vitest"
import { BLANK_DRAFT, VARIABLES, draftFromTemplate, draftProblem, newAction, newCondition, savedIn, variablesFor, withTrigger } from "@/lib/rules/draft"

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

  it("moves a draft onto a schedule: one that makes a task first, or one that acts on each task", () => {
    const named = { ...BLANK_DRAFT, name: "Weekly", conditions: { match: "all" as const, items: [newCondition("priority")] }, else_actions: [newAction("notify")] }
    const once = withTrigger(named, "schedule")
    expect(once.trigger_config).toEqual({ repeat: "FREQ=WEEKLY;BYDAY=MO", at: "09:00" })
    expect(once.actions[0].type).toBe("create_task")
    expect(once.conditions.items).toEqual([])
    expect(once.else_actions).toEqual([])
    expect(draftProblem(once)).toBe("Name the task it makes.")
    once.actions[0].task_name = "Review the week"
    expect(draftProblem(once)).toBe("")

    const each = withTrigger({ ...once, trigger_config: { ...once.trigger_config, at: "16:00" } }, "schedule", true)
    expect(each.trigger_config).toEqual({ repeat: "FREQ=WEEKLY;BYDAY=MO", at: "16:00", each_task: true })
    expect(each.actions.some((a) => a.type === "create_task")).toBe(false)
    expect(each.actions.length).toBeGreaterThan(0)
    expect(withTrigger(each, "task_created").actions.some((a) => a.type === "create_task")).toBe(false)
  })

  it("says what a time trigger is missing", () => {
    const sched = withTrigger({ ...BLANK_DRAFT, name: "x" }, "schedule", true)
    expect(draftProblem({ ...sched, trigger_config: { ...sched.trigger_config, at: "" } })).toBe("Choose the time it runs.")
    expect(draftProblem({ ...sched, trigger_config: { ...sched.trigger_config, repeat: "FREQ=WEEKLY;BYDAY=" } })).toBe("Choose the days it runs.")
    const soon = withTrigger({ ...BLANK_DRAFT, name: "x" }, "task_due_soon")
    expect(soon.trigger_config).toEqual({ days: 1, at: "09:00" })
    expect(draftProblem({ ...soon, trigger_config: { days: 31, at: "09:00" } })).toBe("Say how many days before the due date, 0 to 30.")
    expect(draftProblem({ ...soon, actions: [newAction("ask_agent")] })).toBe("Write what to ask the agent.")
  })

  it("asks which form a form's rule runs on", () => {
    const onForm = withTrigger({ ...BLANK_DRAFT, name: "Requests" }, "form_submitted")
    expect(onForm.trigger_config).toEqual({})
    expect(draftProblem(onForm)).toBe("Pick the form.")
    expect(draftProblem({ ...onForm, trigger_config: { form_id: "f1" } })).toBe("")
  })

  it("says what a form rule's messages can say: the form, the task, its project, its link and each answer, never a status or a mover it has none of", () => {
    expect(variablesFor("form_submitted")).toEqual(["{task}", "{form}", "{project}", "{link}"])
    expect(variablesFor("task_created")).toEqual(VARIABLES)
    // An answered approval: who answered last, how it ended, what they said (R2b).
    expect(variablesFor("approval_decided")).toEqual(["{task}", "{approver}", "{outcome}", "{comment}", "{project}", "{link}"])
  })
})
