import { describe, expect, it } from "vitest"
import type { TaskField } from "@/lib/tasks/fields"
import { askable, draftOf, keptOf } from "@/lib/work/taskTemplateDraft"
import type { TaskTemplate } from "@/lib/work/taskTemplates"

const field = (id: string, type: TaskField["type"], name = id): TaskField => ({ id, project_id: "p", name, type, options: [], on_card: false, position: 0, filter_id: id })
const points = field("f-points", "number", "Points")
const signed = field("f-signed", "checkbox", "Signed off")
const BUG = "5594da4f-672d-4b63-8887-3d4b83ae9cb5"

// The demo's Bug report (business/DemoSeed/taskTemplates.go), with a preset status and assignee, and a field the
// project no longer has.
const bugReport: TaskTemplate = {
  id: "t1",
  project_id: "p",
  name: "Bug report",
  description: "What broke, and how to see it.",
  default_for: BUG,
  shape: {
    name: "Bug: ",
    description: "<h3>Steps to reproduce</h3><ol><li><p></p></li></ol><h3>Expected</h3><p></p>",
    status: "Triage",
    priority: "high",
    tags: "bug",
    type: BUG,
    assignee: "u-sam",
    due_day: 3,
    subtasks: [{ name: "Reproduce it on staging" }, { name: "Fix it" }],
    fields: { "f-points": 3, "f-gone": "kept" },
    required: ["description", "field:f-points"],
  },
}

describe("a task template in the manager's editor (linear-09)", () => {
  it("reads every preset as its box shows it: the body as Markdown, a field as the answer box does", () => {
    const d = draftOf(bugReport, [points, signed])
    expect(d).toMatchObject({ name: "Bug report", title: "Bug: ", type: BUG, isDefault: true, priority: "high", labels: "bug", startDay: "", dueDay: "3" })
    // Kept as HTML, as a task's description is; edited as Markdown (lib/codec/htmlMarkdown).
    expect(d.body).toBe("### Steps to reproduce\n\n1.\n\n### Expected")
    expect(d).toMatchObject({ status: "Triage", assignee: "u-sam" })
    expect(d.subtasks).toEqual(["Reproduce it on staging", "Fix it"])
    expect(d.fields).toEqual({ "f-points": "3" })
    expect(d.asks).toEqual(["description", "field:f-points"])
  })

  it("keeps what it doesn't show, and the body, status and assignee as they came while unchanged", () => {
    const out = keptOf(draftOf(bugReport, [points]), bugReport, [points])
    if (!("kept" in out)) throw new Error(out.error)
    const { shape } = out.kept
    expect(out.kept.default_for).toBe(BUG)
    expect(shape.description).toBe(bugReport.shape.description)
    expect(shape).toMatchObject({ status: "Triage", assignee: "u-sam", due_day: 3, fields: { "f-points": 3, "f-gone": "kept" } })
    expect(shape.start_day).toBeUndefined()
  })

  it("writes an edited body (Markdown, kept as HTML), typed fields and trimmed sub-tasks back as the server keeps them", () => {
    const d = draftOf(bugReport, [points, signed])
    const body = "### What happened\n\n- it froze"
    const out = keptOf({ ...d, body, status: "done", assignee: "agent-ops", fields: { "f-points": "8", "f-signed": true }, subtasks: [" Fix it ", ""], startDay: "1" }, bugReport, [points, signed])
    if (!("kept" in out)) throw new Error(out.error)
    expect(out.kept.shape.description).toBe("<h3>What happened</h3><ul><li><p>it froze</p></li></ul>")
    expect(out.kept.shape).toMatchObject({ status: "done", assignee: "agent-ops" })
    expect(out.kept.shape.fields).toEqual({ "f-points": 8, "f-signed": true, "f-gone": "kept" })
    expect(out.kept.shape.subtasks).toEqual([{ name: "Fix it" }])
    expect(out.kept.shape.start_day).toBe(1)
  })

  it("keeps the task's name as typed, a prefix's space included: New task's title starts with it", () => {
    const d = draftOf(bugReport, [points])
    const out = keptOf(d, bugReport, [points])
    if (!("kept" in out)) throw new Error(out.error)
    expect(out.kept.shape.name).toBe("Bug: ")
    const blank = keptOf({ ...d, title: "   " }, bugReport, [points])
    if (!("kept" in blank)) throw new Error(blank.error)
    expect(blank.kept.shape.name).toBe("")
  })

  it("sends no body, status or assignee once each is cleared: the task starts in the project's first status", () => {
    const out = keptOf({ ...draftOf(bugReport, [points]), body: "", status: "", assignee: "" }, bugReport, [points])
    if (!("kept" in out)) throw new Error(out.error)
    expect(out.kept.shape.description).toBeUndefined()
    expect(out.kept.shape.status).toBeUndefined()
    expect(out.kept.shape.assignee).toBeUndefined()
  })

  it("is a type's default only with a type, and a new one starts empty", () => {
    const fresh = draftOf(undefined, [])
    expect(fresh).toMatchObject({ name: "", body: "", status: "", assignee: "", type: "", isDefault: false, subtasks: [], asks: [] })
    const out = keptOf({ ...fresh, name: " Escalation ", isDefault: true }, undefined, [])
    if (!("kept" in out)) throw new Error(out.error)
    expect(out.kept).toMatchObject({ name: "Escalation", default_for: "" })
  })

  it("says what to fix: a name, a day, a due day before the start, a field's value", () => {
    const d = draftOf(bugReport, [points])
    expect(keptOf({ ...d, name: "  " }, bugReport, [points])).toEqual({ error: "Give the template a name." })
    expect(keptOf({ ...d, dueDay: "x" }, bugReport, [points])).toHaveProperty("error")
    expect(keptOf({ ...d, dueDay: "400" }, bugReport, [points])).toHaveProperty("error")
    expect(keptOf({ ...d, startDay: "5", dueDay: "2" }, bugReport, [points])).toEqual({ error: "The task would be due before it starts: make its due day 5 or later." })
    expect(keptOf({ ...d, fields: { "f-points": "lots" } }, bugReport, [points])).toHaveProperty("error")
  })

  it("offers the form's properties, then each of the project's fields, to ask for", () => {
    expect(askable([points])).toEqual(["description", "priority", "due", "start", "tags", "assignee", "type", "field:f-points"])
  })
})
