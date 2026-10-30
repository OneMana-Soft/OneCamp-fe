import { describe, expect, it } from "vitest"
import type { TaskField } from "@/lib/tasks/fields"
import { canMove, defaultPriorities, fillTargets, formProblem, removeChoice, renameChoice, retype, showIfText, tidyForm, withoutItem } from "./build"
import type { FormField, ProjectForm, ShowIf } from "./forms"

// What saves, as business/Form's CheckForm, checkMapsTo and checkFields say
// it, in their words: the cases are branch_test.go's
// TestABranchIsCheckedWhenTheFormIsSaved and TestWhatAnAnswerFillsIsChecked.

const formOf = (fields: FormField[], over: Partial<ProjectForm> = {}): ProjectForm => ({
  title: "x", description: "", fields, title_field: "", priority: "medium", active: true, ...over,
})
const q = (id: string, type: FormField["type"], show_if?: ShowIf, ...options: string[]): FormField => ({
  id, label: id, type, required: false, show_if, options: options.length ? options : undefined,
})
const is = (on: string, v: string): ShowIf => ({ question: on, op: "is", values: [v] })

const branching: FormField[] = [
  { id: "what", label: "What do you need?", type: "short_text", required: true },
  { id: "kind", label: "Kind", type: "select", required: true, options: ["Bug", "Idea"] },
  { id: "steps", label: "Steps to reproduce", type: "long_text", required: true, show_if: is("kind", "Bug") },
  { id: "s2", label: "The idea", type: "section", required: false, show_if: is("kind", "Idea") },
  { id: "why", label: "Why it matters", type: "long_text", required: true },
  { id: "s3", label: "Anything else", type: "section", required: false },
  { id: "areas", label: "Areas", type: "multi_select", required: false, options: ["Web", "Phone", "API"] },
  { id: "site", label: "Where it happens", type: "url", required: false, show_if: { question: "areas", op: "any_of", values: ["Web"] } },
  { id: "phone", label: "Phone", type: "phone", required: false },
]

describe("a branch is checked as the form is saved (TestABranchIsCheckedWhenTheFormIsSaved)", () => {
  it("saves a good form", () => {
    expect(formProblem(formOf(branching))).toBeNull()
  })

  it("refuses what the server refuses, saying which item", () => {
    const bad: [FormField[], string][] = [
      [[q("a", "short_text", is("b", "Yes")), q("b", "checkbox")], "Item 1 shows on an answer that has to come before it."],
      [[q("a", "short_text", is("a", "Yes"))], "Item 1 shows on an answer that has to come before it."],
      [[q("a", "short_text"), q("b", "short_text", is("a", "x"))], "Item 2 can only show when “a” is answered: it has no choices."],
      [[q("a", "select", undefined, "One", "Two"), q("b", "short_text", is("a", "Three"))], "Item 2 shows on “Three”, which isn't a choice of “a”."],
      [[q("a", "select", undefined, "One", "Two"), q("b", "short_text", { question: "a", op: "near" as ShowIf["op"] })], "Item 2 shows on a condition this form can't read."],
      [[q("a", "short_text"), q("s", "section")], "The section “s” needs a question in it."],
      [[q("s", "section"), q("t", "section"), q("a", "short_text")], "The section “s” needs a question in it."],
      [[{ ...q("a", "short_text"), help: "h".repeat(301) }], "Keep item 1's help under 300 characters."],
    ]
    for (const [fields, message] of bad) expect(formProblem(formOf(fields))?.message).toBe(message)
    expect(formProblem(formOf([q("a", "short_text"), q("b", "short_text", is("a", "x"))]))?.index).toBe(1)
  })

  it("lets a condition read a text answer as answered, and twenty questions sit under a section", () => {
    expect(formProblem(formOf([q("a", "short_text"), q("b", "short_text", { question: "a", op: "answered" })]))).toBeNull()
    const many = [q("s0", "section"), ...Array.from({ length: 20 }, (_, i) => q(`q${i}`, "short_text"))]
    expect(formProblem(formOf(many))).toBeNull()
    expect(formProblem(formOf([...many, q("q21", "short_text")]))?.message).toBe("A form has 1 to 20 questions.")
  })

  it("reads a checkbox's answer as Yes or No, and needs the choice a condition shows on", () => {
    expect(formProblem(formOf([q("a", "checkbox"), q("b", "short_text", is("a", "Yes"))]))).toBeNull()
    expect(formProblem(formOf([q("a", "select", undefined, "One", "Two"), q("b", "short_text", { question: "a", op: "is", values: [] })]))?.message).toBe("Item 2 needs the choice it shows on.")
    expect(formProblem(formOf([q("a", "select", undefined, "One", "Two"), q("b", "short_text", { question: "a", op: "is", values: ["One", "Two"] })]))?.message).toBe("Item 2 needs the choice it shows on.")
    expect(formProblem(formOf([q("a", "select", undefined, "One", "Two"), q("b", "short_text", { question: "a", op: "any_of", values: ["One", "Two"] })]))).toBeNull()
  })

  it("asks for a title, labels and choices", () => {
    expect(formProblem(formOf([q("a", "short_text")], { title: "  " }))?.message).toBe("Give the form a title of up to 120 characters.")
    expect(formProblem(formOf([{ ...q("a", "short_text"), label: " " }]))?.message).toBe("Item 1 needs a label of up to 200 characters.")
    expect(formProblem(formOf([q("a", "select", undefined, "Only one")]))?.message).toBe("Question 1 needs 2 to 50 choices.")
    expect(formProblem(formOf([q("a", "select", undefined, "One", " One ", "")]))?.message).toBe("Question 1 needs 2 to 50 choices.")
    expect(formProblem(formOf([q("a", "short_text")], { confirmation: "x".repeat(501) }))?.message).toBe("Keep the message after sending under 500 characters.")
  })
})

describe("what an answer fills is checked (TestWhatAnAnswerFillsIsChecked)", () => {
  const sel = (map: Record<string, string>): FormField => ({ id: "p", label: "How urgent?", type: "select", required: false, options: ["Now", "Later"], maps_to: "priority", map: map as FormField["map"] })
  const field = "6f1c1c5e-6a52-4d1b-9a4e-1e2f3a4b5c6d"

  it("saves a good mapping", () => {
    expect(formProblem(formOf([
      q("what", "short_text"),
      sel({ Now: "high", Later: "low" }),
      { ...q("by", "date"), maps_to: "due" },
      { ...q("areas", "multi_select", undefined, "Web", "API"), maps_to: "tags" },
      { ...q("f", "number"), maps_to: `field:${field}` },
    ]))).toBeNull()
  })

  it("refuses what the server refuses", () => {
    const bad: [FormField[], string][] = [
      [[{ ...q("a", "short_text"), maps_to: "priority" }], "Question 1 sets the priority, so it needs to be a choice."],
      [[sel({ Now: "high" })], "Question 1: say which priority “Later” sets."],
      [[sel({ Now: "high", Later: "someday" })], "Question 1: say which priority “Later” sets."],
      [[{ ...q("a", "short_text"), maps_to: "due" }], "Question 1 sets the due date, so it needs to be a date."],
      [[{ ...q("a", "date"), maps_to: "tags" }], "Question 1 sets tags, so it needs to be a choice."],
      [[{ ...q("a", "date"), maps_to: "due" }, { ...q("b", "date"), maps_to: "due" }], "Question 2 fills what another question already fills."],
      [[{ ...q("a", "number"), maps_to: "field:nope" }], "Question 1 fills a field this project doesn't have."],
      [[{ ...q("a", "number"), maps_to: "status" }], "Question 1 fills something a form can't fill."],
      [[{ ...q("s", "section"), maps_to: "tags" }, q("a", "short_text")], "Item 1 is a section, which fills nothing."],
    ]
    for (const [fields, message] of bad) expect(formProblem(formOf(fields))?.message).toBe(message)
  })
})

const projectField = (over: Partial<TaskField>): TaskField => ({
  id: "f1", project_id: "p", name: "Field", type: "text", options: [], on_card: false, position: 0, filter_id: "", ...over,
})
const team = projectField({ id: "11111111-1111-4111-8111-111111111111", name: "Team", type: "text" })
const stage = projectField({ id: "22222222-2222-4222-8222-222222222222", name: "Stage", type: "select", options: [{ id: "o1", label: "Draft", color: "" }, { id: "o2", label: "Live", color: "" }] })
const launch = projectField({ id: "33333333-3333-4333-8333-333333333333", name: "Launch", type: "date" })
const owner = projectField({ id: "44444444-4444-4444-8444-444444444444", name: "Owner", type: "person" })
const project = [team, stage, launch, owner]

describe("the project's fields an answer can fill (checkFields)", () => {
  it("are those of the question's kind, as fill.go's table says; a person field takes no answer", () => {
    const pick = q("p", "select", undefined, "A", "B")
    expect(fillTargets(pick, [pick], project).map((t) => t.value)).toEqual(["", "priority", "tags", `field:${stage.id}`])
    const day = q("d", "date")
    expect(fillTargets(day, [day], project).map((t) => t.label)).toEqual(["Only the description", "The due date", "Launch"])
    const mail = q("m", "email")
    expect(fillTargets(mail, [mail], project).map((t) => t.label)).toEqual(["Only the description", "Team"])
  })

  it("say which another question already fills", () => {
    const a: FormField = { ...q("a", "date"), label: "Needed by", maps_to: "due" }
    const b = q("b", "date")
    expect(fillTargets(b, [a, b], project).find((t) => t.value === "due")?.taken).toBe("“Needed by” fills it")
    expect(fillTargets(a, [a, b], project).find((t) => t.value === "due")?.taken).toBeUndefined()
  })

  it("are checked against the project as the server checks them", () => {
    const fills = (f: FormField) => formProblem(formOf([f]), project)?.message
    expect(fills({ ...q("a", "short_text"), label: "Budget", maps_to: "field:55555555-5555-4555-8555-555555555555" })).toBe("“Budget” fills a field this project doesn't have.")
    expect(fills({ ...q("a", "short_text"), label: "When", maps_to: `field:${launch.id}` })).toBe("“When” can't fill Launch: ask it as a date.")
    expect(fills({ ...q("a", "select", undefined, "Draft", "Live"), maps_to: `field:${stage.id}` })).toBeUndefined()
    const thin = projectField({ id: stage.id, name: "Stage", type: "select", options: [{ id: "o1", label: "Draft", color: "" }] })
    expect(formProblem(formOf([{ ...q("a", "select", undefined, "Draft", "Live"), maps_to: `field:${stage.id}` }]), [thin])?.message).toBe("Stage needs 2 to 50 options for a form to offer.")
  })
})

describe("a form kept whole as it changes", () => {
  const form = (): FormField[] => [
    { id: "kind", label: "Kind", type: "select", required: false, options: ["Copy", "A bug"], maps_to: "priority", map: { Copy: "low", "A bug": "high" } },
    { id: "steps", label: "Steps", type: "long_text", required: true, show_if: is("kind", "A bug") },
    { id: "more", label: "More", type: "short_text", required: false, show_if: { question: "kind", op: "any_of", values: ["Copy", "A bug"] } },
  ]

  it("carries a renamed choice into the priority it sets and the conditions on it", () => {
    const next = renameChoice(form(), 0, 1, "Bug")
    expect(next[0].options).toEqual(["Copy", "Bug"])
    expect(next[0].map).toEqual({ Copy: "low", Bug: "high" })
    expect(next[1].show_if?.values).toEqual(["Bug"])
    expect(next[2].show_if?.values).toEqual(["Copy", "Bug"])
  })

  it("takes a removed choice out of the conditions, and a condition left with none goes too", () => {
    const { fields, released } = removeChoice(form(), 0, 1)
    expect(fields[0].options).toEqual(["Copy"])
    expect(fields[0].map).toEqual({ Copy: "low" })
    expect(fields[1].show_if).toBeUndefined()
    expect(fields[2].show_if?.values).toEqual(["Copy"])
    expect(released).toEqual(["Steps"])
  })

  it("lets go of the conditions on a question removed, and names the task from another", () => {
    const { fields, released, titleField } = withoutItem(form(), 0, "kind")
    expect(fields.map((f) => f.id)).toEqual(["steps", "more"])
    expect(fields.every((f) => !f.show_if)).toBe(true)
    expect(released).toEqual(["Steps", "More"])
    expect(titleField).toBe("steps")
  })

  it("won't move a question above the answer it shows on, nor that answer below it", () => {
    expect(canMove(form(), 1, -1)).toBe("“Steps” shows on “Kind”'s answer, so it comes after it.")
    expect(canMove(form(), 0, 1)).toBe("“Steps” shows on “Kind”'s answer, so it comes after it.")
    expect(canMove(form(), 2, -1)).toBe("")
  })

  it("keeps what still fits when a question changes kind", () => {
    const toMany = retype(form(), 0, "multi_select")
    expect(toMany[0].options).toEqual(["Copy", "A bug"])
    expect(toMany[0].maps_to).toBeUndefined()
    expect(toMany[0].map).toBeUndefined()
    expect(toMany[1].show_if).toEqual(is("kind", "A bug"))
    const toText = retype(form(), 0, "short_text")
    expect(toText[0].options).toBeUndefined()
    expect(toText[1].show_if).toEqual({ question: "kind", op: "answered" })
    const toChoice = retype([q("a", "short_text"), q("b", "short_text", { question: "a", op: "answered" })], 0, "select")
    expect(toChoice[0].options).toEqual(["", ""])
  })

  it("starts a choice's priorities from the top down", () => {
    expect(defaultPriorities(["This week", "This month", "Whenever"])).toEqual({ "This week": "high", "This month": "medium", Whenever: "low" })
    expect(defaultPriorities(["Now", "Later"])).toEqual({ Now: "high", Later: "low" })
  })

  it("sends what the server keeps: words tidied, choices once each, a section asking and filling nothing", () => {
    const tidy = tidyForm(formOf([
      { id: "s", label: " About  you ", type: "section", required: true, maps_to: "tags" },
      { id: "kind", label: "Kind ", type: "select", required: false, options: [" Copy ", "Copy", "", "A  bug"], maps_to: "priority", map: { " Copy ": "low", "A  bug": "high" } },
      { id: "b", label: "B", type: "short_text", required: false, show_if: { question: "kind", op: "is", values: [" A  bug"] }, help: "  " },
    ], { title: "  Requests ", confirmation: " Thanks " }))
    expect(tidy.title).toBe("Requests")
    expect(tidy.confirmation).toBe("Thanks")
    expect(tidy.fields[0]).toEqual({ id: "s", label: "About you", type: "section", required: false })
    expect(tidy.fields[1].options).toEqual(["Copy", "A bug"])
    expect(tidy.fields[1].map).toEqual({ Copy: "low", "A bug": "high" })
    expect(tidy.fields[2].show_if?.values).toEqual(["A bug"])
    expect(tidy.fields[2].help).toBeUndefined()
    // A choice with no priority picked saves as the Medium its pick shows.
    const fresh = tidyForm(formOf([{ id: "p", label: "Soon?", type: "select", required: false, options: ["Now", "Later", ""], maps_to: "priority", map: { Now: "high", "": "low" } }]))
    expect(fresh.fields[0].map).toEqual({ Now: "high", Later: "medium" })
  })

  it("sends a hidden question hidden, as its switch set it, and checks it as the dialog does: tidied, then checked (tables B5b)", () => {
    const tidy = tidyForm(formOf([
      { id: "budget", label: "Budget", type: "number", required: false, hidden: true },
      { id: "name", label: "Name", type: "short_text", required: false },
    ]))
    expect(tidy.fields.map((f) => [f.id, f.hidden])).toEqual([["budget", true], ["name", undefined]])
    expect(formProblem(tidyForm(formOf([{ id: "budget", label: "Budget", type: "number", required: true, hidden: true }])))?.message).toMatch(/is hidden, so only its link fills it/)
    // Only a question its link can answer is hidden: a file or a section never is, and one retyped to either stops being.
    const hidden: FormField = { ...q("budget", "number"), hidden: true }
    expect(retype([hidden], 0, "file")[0].hidden).toBeUndefined()
    expect(retype([hidden], 0, "section")[0].hidden).toBeUndefined()
    expect(retype([hidden], 0, "short_text")[0].hidden).toBe(true)
  })
})

describe("a condition, said", () => {
  const fields: FormField[] = [
    { id: "kind", label: "Kind", type: "select", required: false, options: ["Copy", "Design", "A bug"] },
    { id: "ok", label: "Signed", type: "checkbox", required: false },
    { id: "mail", label: "Email", type: "email", required: false },
  ]
  it("reads as a sentence about the earlier answer", () => {
    expect(showIfText(is("kind", "A bug"), fields)).toBe("‘Kind’ is A bug")
    expect(showIfText({ question: "kind", op: "is_not", values: ["Copy"] }, fields)).toBe("‘Kind’ isn't Copy")
    expect(showIfText({ question: "kind", op: "any_of", values: ["Copy", "Design"] }, fields)).toBe("‘Kind’ is Copy or Design")
    expect(showIfText({ question: "mail", op: "answered" }, fields)).toBe("‘Email’ is answered")
    expect(showIfText(is("ok", "Yes"), fields)).toBe("‘Signed’ is ticked")
    expect(showIfText({ question: "ok", op: "is_not", values: ["Yes"] }, fields)).toBe("‘Signed’ isn't ticked")
  })
})
