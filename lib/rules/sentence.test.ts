import { describe, expect, it } from "vitest"
import { ruleSentence, sentenceText, conditionText, triggerText } from "@/lib/rules/sentence"
import type { RuleDraft } from "@/lib/rules/types"

const names = { status: (v: string) => ({ done: "Done", "qa-id": "QA", inReview: "In review" })[v], person: (id: string) => ({ ana: "Ana Ruiz" })[id] }

const draft = (over: Partial<RuleDraft>): RuleDraft => ({
  name: "x", is_active: true, trigger_type: "task_created", trigger_config: {}, conditions: {}, actions: [], else_actions: [], ...over,
})

describe("a rule reads as one sentence", () => {
  it("says the trigger, the conditions, what happens and otherwise", () => {
    const parts = ruleSentence(
      draft({
        trigger_type: "task_status_changed",
        trigger_config: { to_status: "done" },
        conditions: { match: "all", items: [{ field: "tags", op: "has", value: "needs review" }] },
        actions: [{ type: "set_status", status: "inReview" }, { type: "add_comment", text: "Review it" }],
        else_actions: [{ type: "notify", notify: "creator", text: "{task} is done" }],
      }),
      names,
    )
    expect(sentenceText(parts)).toBe(
      "When a task moves to Done if it's tagged needs review then move it to In review and comment on it otherwise tell its creator",
    )
  })

  it("names people and statuses from the project, and says someone for anyone it doesn't know", () => {
    expect(conditionText({ field: "assignee", op: "is", value: "ana" }, names)).toBe("Ana Ruiz has it")
    expect(conditionText({ field: "creator", op: "is_not", value: "gone" }, names)).toBe("someone didn't make it")
    expect(triggerText({ trigger_type: "task_status_changed", trigger_config: { to_status: "qa-id" } }, names)).toBe("a task moves to QA")
    expect(triggerText({ trigger_type: "task_field_changed", trigger_config: { fields: ["priority", "due"] } })).toBe("a task's priority or due date changes")
  })

  it("keeps a long rule to a line: the rest is counted", () => {
    const parts = ruleSentence(
      draft({ actions: [1, 2, 3, 4, 5].map(() => ({ type: "add_subtask" as const, task_name: "Step" })) }),
      names,
    )
    expect(sentenceText(parts).endsWith("+2")).toBe(true)
  })

  it("says due days in words", () => {
    const one = ruleSentence(draft({ actions: [{ type: "set_due", due_in_days: 1 }, { type: "set_due", due_in_days: null }] }))
    expect(sentenceText(one)).toContain("make it due in 1 day and clear its due date")
  })
})
