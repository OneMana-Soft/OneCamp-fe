import { describe, expect, it } from "vitest"
import { ruleSentence, sentenceText, conditionText, suggestedName, triggerText } from "@/lib/rules/sentence"
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

  it("says an answered approval's trigger by how it must end", () => {
    expect(triggerText({ trigger_type: "approval_decided", trigger_config: {} })).toBe("a task's approval is answered")
    expect(triggerText({ trigger_type: "approval_decided", trigger_config: { outcome: "approved" } })).toBe("a task is approved")
    expect(triggerText({ trigger_type: "approval_decided", trigger_config: { outcome: "changes" } })).toBe("changes are asked for on a task")
    expect(triggerText({ trigger_type: "approval_decided", trigger_config: { outcome: "rejected" } })).toBe("a task's approval is rejected")
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

  it("says a schedule: one that makes a task, and one that acts for each task", () => {
    const monday = ruleSentence(draft({
      trigger_type: "schedule", trigger_config: { repeat: "FREQ=WEEKLY;BYDAY=MO", at: "09:00" },
      actions: [{ type: "create_task", task_name: "Review the week" }, { type: "set_due", due_in_days: 4 }],
    }))
    expect(sentenceText(monday)).toMatch(/^When every Monday at 9:00\s?AM then make ‘Review the week’ and make it due in 4 days$/i)

    const friday = ruleSentence(draft({
      trigger_type: "schedule", trigger_config: { repeat: "FREQ=WEEKLY;BYDAY=FR", at: "16:00", each_task: true },
      conditions: { match: "all", items: [{ field: "due", op: "overdue" }] },
      actions: [{ type: "notify", notify: "assignee", text: "{task} is overdue" }],
    }))
    expect(sentenceText(friday)).toMatch(/^When every Friday at 4:00\s?PM for each open task where it's overdue then tell whoever has it$/i)
  })

  it("says due dates and asking an agent", () => {
    const soon = ruleSentence(draft({ trigger_type: "task_due_soon", trigger_config: { days: 1, at: "09:00" }, actions: [{ type: "notify", notify: "assignee", text: "x" }] }))
    expect(sentenceText(soon)).toBe("When a task is due tomorrow then tell whoever has it")
    const late = ruleSentence(draft({ trigger_type: "task_overdue", trigger_config: { at: "09:00" }, actions: [{ type: "set_priority", priority: "high" }] }))
    expect(sentenceText(late)).toBe("When a task becomes overdue then make it high priority")
    const agent = ruleSentence(draft({ conditions: { items: [{ field: "tags", op: "has", value: "bug" }] }, actions: [{ type: "ask_agent", text: "Triage it" }] }))
    expect(sentenceText(agent)).toBe("When a task is made if it's tagged bug then ask OneCamp AI")
    const named = ruleSentence(draft({ actions: [{ type: "ask_agent", text: "?", agent_id: "t1" }] }), { agent: (id) => ({ t1: "Triage Bot" })[id] })
    expect(sentenceText(named)).toBe("When a task is made then ask Triage Bot")
  })

  it("names a rule from what it does until someone names it", () => {
    expect(suggestedName(draft({ trigger_type: "task_due_soon", trigger_config: { days: 1 }, actions: [{ type: "ask_agent", text: "?" }] }))).toBe("A task is due tomorrow: ask OneCamp AI")
    expect(suggestedName(draft({ trigger_type: "schedule", trigger_config: { repeat: "FREQ=WEEKLY;BYDAY=MO", at: "09:00" }, actions: [{ type: "create_task", task_name: "Review the week" }] })))
      .toMatch(/^Every Monday at 9:00\s?AM: make ‘Review the week’$/i)
  })
})

describe("a rule on a form (package 9 R4)", () => {
  const withForms = { ...names, form: (id: string) => ({ f1: "Launch requests" })[id] }
  const onForm = draft({ trigger_type: "form_submitted", trigger_config: { form_id: "f1" }, actions: [{ type: "set_priority", priority: "high" }] })

  it("names the form it runs on", () => {
    expect(sentenceText(ruleSentence(onForm, withForms))).toBe("When ‘Launch requests’ is sent then make it high priority")
    expect(triggerText(onForm)).toBe("a form is sent")
    expect(suggestedName(onForm, withForms)).toBe("‘Launch requests’ is sent: make it high priority")
  })
})
