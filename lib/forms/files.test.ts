import { describe, expect, it } from "vitest"
import { checkAnswers, firstProblem } from "./answers"
import { shown } from "./branch"
import { formProblem, retype, tidyForm, withoutItem } from "./build"
import type { FormField, ProjectForm } from "./forms"

// A question that takes files, as business/Form's files_test.go says it:
// TestAQuestionTakesFiles and TestAFileAnswerIsItsUploadsIds.

const withFiles = (): FormField[] => [
  { id: "what", label: "What do you need?", type: "short_text", required: true },
  { id: "kind", label: "Kind", type: "select", required: false, options: ["Bug", "Idea"] },
  { id: "shots", label: "Screenshots", type: "file", required: true, show_if: { question: "kind", op: "is", values: ["Bug"] } },
  { id: "brief", label: "A brief", type: "file", required: false },
  { id: "more", label: "Anything else", type: "long_text", required: false, show_if: { question: "brief", op: "answered" } },
]
const formOf = (fields: FormField[], over: Partial<ProjectForm> = {}): ProjectForm => ({
  title: "Requests", description: "", fields, title_field: "", priority: "medium", active: true, ...over,
})
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

describe("a question takes files (TestAQuestionTakesFiles)", () => {
  it("saves, and never names the task", () => {
    expect(formProblem(formOf(withFiles()))).toBeNull()
    expect(tidyForm(formOf(withFiles(), { title_field: "brief" })).title_field).toBe("what")
    // Files alone: the task is named after the form.
    expect(formProblem(formOf([{ id: "a", label: "Your CV", type: "file", required: true }]))).toBeNull()
    expect(tidyForm(formOf([{ id: "a", label: "Your CV", type: "file", required: true }], { title_field: "a" })).title_field).toBe("")
  })

  it("refuses what the server refuses", () => {
    const f = (id: string, over: Partial<FormField> = {}): FormField => ({ id, label: id.toUpperCase(), type: "file", required: false, ...over })
    const bad: [FormField[], string][] = [
      [[{ id: "a", label: "A", type: "short_text", required: false }, f("b", { maps_to: "tags" })], "Question 2 takes files, which go on the task: it fills nothing else."],
      [[f("a"), { id: "b", label: "B", type: "short_text", required: false, show_if: { question: "a", op: "is", values: ["x"] } }], "Item 2 can only show when “A” is answered: it has no choices."],
      [[f("a"), f("b"), f("c"), f("d")], "A form asks for files at most 3 times."],
    ]
    for (const [fields, message] of bad) expect(formProblem(formOf(fields))?.message).toBe(message)
  })

  it("lets go of what a question no longer fits when it becomes one that takes files", () => {
    const fields: FormField[] = [{ id: "a", label: "Area", type: "select", required: false, options: ["Web", "API"], maps_to: "tags" }]
    const next = retype(fields, 0, "file")
    expect(next[0].options).toBeUndefined()
    expect(next[0].maps_to).toBeUndefined()
  })

  it("names the task from a question in words when the one that named it goes", () => {
    const fields: FormField[] = [
      { id: "what", label: "What", type: "short_text", required: true },
      { id: "shots", label: "Shots", type: "file", required: false },
      { id: "why", label: "Why", type: "long_text", required: false },
    ]
    expect(withoutItem(fields, 0, "what").titleField).toBe("why")
  })
})

describe("a file answer is its uploads' ids (TestAFileAnswerIsItsUploadsIds)", () => {
  const kept = (raw: Record<string, unknown>) => Object.fromEntries(checkAnswers(withFiles(), raw).kept.map((a) => [a.id, a.value]))

  it("keeps each id once, drops an empty answer and a hidden question's files", () => {
    expect(kept({ what: "Crash", kind: "Bug", shots: [id(1), id(2), id(1)], brief: [] })).toEqual({ what: "Crash", kind: "Bug", shots: `${id(1)}, ${id(2)}` })
    expect(kept({ what: "Dark mode", kind: "Idea", shots: [id(1)] })).toEqual({ what: "Dark mode", kind: "Idea" })
  })

  it("shows a question once files are added", () => {
    expect(shown(withFiles(), { what: "x", kind: "Idea", brief: [id(1)] }).items.map((f) => f.id)).toContain("more")
    expect(shown(withFiles(), { what: "x", kind: "Idea", brief: [] }).items.map((f) => f.id)).not.toContain("more")
    expect(kept({ what: "Dark mode", kind: "Idea", brief: [id(1)], more: "see the brief" }).more).toBe("see the brief")
  })

  it("refuses what the server refuses, in its words", () => {
    const base = { what: "Crash", kind: "Bug" }
    const said = (raw: Record<string, unknown>) => checkAnswers(withFiles(), raw).problem?.message
    expect(said(base)).toBe("“Screenshots” needs a file.")
    expect(said({ ...base, shots: "one" })).toBe("“Screenshots” isn't answered the right way.")
    expect(said({ ...base, shots: ["not an id"] })).toBe("“Screenshots” isn't answered the right way.")
    expect(said({ ...base, shots: [1, 2, 3, 4, 5, 6].map(id) })).toBe("Add at most 5 files to “Screenshots”.")
    expect(firstProblem(withFiles().slice(2, 3), {})?.required).toBe(true)
  })
})
