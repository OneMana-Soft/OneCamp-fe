import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { askLabel, askedField, defaultFor, groupTemplates, prefillOf, typedOf, unfilled, type TemplateShape } from "./taskTemplates"

// Task templates as New task uses them (linear-09; business/TaskTemplate):
// what a template asks for in words, its shape as the form's starting values,
// the form's values as make's typed ones, and a refusal for what it asks for.

const today = new Date(2026, 10, 2, 9, 30)
pinTestClock(today)

describe("what a template asks for, in words", () => {
  it("names each property the form has", () => {
    const props = ["description", "priority", "due", "start", "tags", "assignee", "type"]
    expect(props.map((p) => askLabel(p, []))).toEqual(["Description", "Priority", "Due date", "Start date", "Labels", "Assignee", "Type"])
  })
  it("names a field by the project's own name, and one it can't find plainly", () => {
    const fields = [{ id: "f1", name: "Severity" }]
    expect(askLabel("field:f1", fields)).toBe("Severity")
    expect(askLabel("field:gone", fields)).toBe("A field")
    expect(askedField("field:f1")).toBe("f1")
    expect(askedField("due")).toBeNull()
  })
})

describe("a template's shape, as the form's starting values", () => {
  it("counts its days from today, in the maker's own calendar", () => {
    const p = prefillOf({ name: "Bug: ", priority: "high", tags: "bug", status: "triage", assignee: "u1", start_day: 0, due_day: 3 }, today)
    expect(p).toMatchObject({ name: "Bug: ", priority: "high", tags: "bug", status: "triage", assignee: "u1" })
    expect(p.start).toEqual(new Date(2026, 10, 2))
    expect(p.due).toEqual(new Date(2026, 10, 5))
  })
  it("leaves out what the template leaves out", () => {
    expect(prefillOf({ name: "" }, today)).toEqual({})
  })
})

describe("what the form shows, as make's typed values", () => {
  const shape: TemplateShape = { name: "Bug: ", start_day: 1, due_day: 3 }
  it("sends what the form shows, so a value typed over the template wins", () => {
    const start = new Date(2026, 10, 3)
    const due = new Date(2026, 10, 9)
    const typed = typedOf(
      { name: "Bug: login fails", description: "<p>Steps</p>", priority: "urgent", tags: "bug, auth", status: "todo", assignee: "u2", type: "t-bug", start, due, fields: { f1: "o2" } },
      shape,
    )
    expect(typed).toEqual({
      name: "Bug: login fails",
      description: "<p>Steps</p>",
      priority: "urgent",
      tags: "bug, auth",
      status: "todo",
      assignee: "u2",
      type: "t-bug",
      start: start.toISOString(),
      due: due.toISOString(),
      fields: { f1: "o2" },
    })
  })
  it("clears a date the template sets when the form's was taken off", () => {
    expect(typedOf({ name: "x" }, shape)).toEqual({ name: "x", clear_start: true, clear_due: true })
    expect(typedOf({ name: "x" }, { name: "" })).toEqual({ name: "x" })
  })
  // Make keeps the template's value for a key it isn't sent, and clears it for
  // "" (business/TaskTemplate pick): so a value the form emptied goes as "".
  const sets: TemplateShape = { name: "Bug: ", description: "<p>Steps</p>", priority: "high", tags: "bug", status: "triage", assignee: "u1", type: "t-bug" }
  it.each([
    ["description", { description: "<p></p>" }],
    ["priority", { priority: "" }],
    ["tags", { tags: "" }],
    ["status", { status: "" }],
    ["assignee", { assignee: "" }],
  ] as const)("clears the template's %s when the form has emptied it", (key, emptied) => {
    expect(typedOf({ name: "x", ...emptied }, sets)[key]).toBe("")
  })
  it("sends nothing for what the form left empty and the template doesn't set, and never empties the type", () => {
    expect(typedOf({ name: "x", description: "<p></p>", priority: "", tags: "", status: "", assignee: "" }, { name: "" })).toEqual({ name: "x" })
    // The Type chip shows the template's type when the project has it; when it doesn't, make names why the task is a Task.
    expect(typedOf({ name: "x" }, sets)).not.toHaveProperty("type")
  })
  it("sends no description when the editor holds only empty paragraphs", () => {
    expect(typedOf({ name: "x", description: "<p></p>" }, { name: "" })).toEqual({ name: "x" })
    expect(typedOf({ name: "x", description: '<p><img src="a.png"></p>' }, { name: "" }).description).toBe('<p><img src="a.png"></p>')
  })
})

describe("the list the picker shows", () => {
  it("puts the project's own first, then the workspace's, each in the server's order", () => {
    const list = [
      { id: "a", name: "Bug", project_id: "p" },
      { id: "b", name: "Review" },
      { id: "c", name: "Spike", project_id: "p" },
    ]
    expect(groupTemplates(list)).toEqual({ project: [list[0], list[2]], workspace: [list[1]] })
  })
  it("starts a new task of a type from that type's default", () => {
    expect(defaultFor({ "t-task": "a" }, "t-task")).toBe("a")
    expect(defaultFor({ "t-task": "a" }, "t-bug")).toBeUndefined()
    expect(defaultFor(undefined, "t-task")).toBeUndefined()
    expect(defaultFor({ "t-task": "a" }, undefined)).toBeUndefined()
  })
})

describe("what goes back when the template is swapped or dropped", () => {
  const due = new Date(2026, 10, 9)
  it("puts back each value the template set that the form still holds, as it was before", () => {
    const filled = { priority: { was: "medium", set: "high" }, tags: { was: "", set: "bug" }, due: { was: undefined, set: due } }
    expect(unfilled(filled, { priority: "high", tags: "bug", due: new Date(due) })).toEqual({ priority: "medium", tags: "", due: undefined })
  })
  it("leaves the maker's own: a value changed since the template set it stays", () => {
    const filled = { priority: { was: "medium", set: "high" }, tags: { was: "", set: "bug" }, due: { was: undefined, set: due } }
    expect(unfilled(filled, { priority: "urgent", tags: "bug, auth", due: new Date(2026, 10, 10) })).toEqual({})
  })
})
