import { describe, expect, it } from "vitest"
import { columnTargets, formProblem, tidyForm, type FormColumn } from "./build"
import type { FormField, ProjectForm } from "./forms"

// A form that adds a table row instead of making a task, as business/Form's
// row_test.go says it: TestAFormThatAddsRowsFillsAColumnWithEachQuestion and
// TestAFormThatAddsRowsIsCheckedAgainstItsTable.

const col = (id: string, name: string, type: string, over: Partial<FormColumn> = {}): FormColumn => ({ id, name, type, options: [], required: false, startsFilled: false, ...over })
const uuid = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`
const columns: FormColumn[] = [
  col(uuid(1), "Name", "text", { required: true }),
  col(uuid(2), "Email", "email", { required: true, startsFilled: true }),
  col(uuid(3), "Tier", "select", { options: ["Gold", "Silver"] }),
  col(uuid(4), "Services", "multi_select", { options: ["Print", "Video", "Web"] }),
  col(uuid(5), "Budget", "number"),
  col(uuid(6), "Starts", "date"),
  col(uuid(7), "Signed", "checkbox"),
  col(uuid(8), "Site", "url"),
  col(uuid(9), "Owner", "person"),
  col(uuid(10), "Score", "formula"),
]
const fills = (name: string) => `column:${columns.find((c) => c.name === name)!.id}`
const signUp = (): FormField[] => [
  { id: "name", label: "Company", type: "short_text", required: true, maps_to: fills("Name") },
  { id: "tier", label: "Tier", type: "select", required: false, options: ["a", "b"], maps_to: fills("Tier") },
  { id: "services", label: "Services", type: "multi_select", required: false, options: ["a", "b"], maps_to: fills("Services") },
  { id: "budget", label: "Budget", type: "number", required: false, maps_to: fills("Budget") },
  { id: "starts", label: "Start", type: "date", required: false, maps_to: fills("Starts") },
  { id: "signed", label: "Signed?", type: "checkbox", required: false, maps_to: fills("Signed") },
  { id: "site", label: "Website", type: "url", required: false, maps_to: fills("Site") },
]
const formOf = (fields: FormField[]): ProjectForm => ({
  title: "Vendor sign-up", description: "", fields, title_field: "", priority: "high", active: true, target_table: uuid(99), assignee_uuid: uuid(98),
})

describe("each question fills a column (TestAFormThatAddsRowsFillsAColumnWithEachQuestion)", () => {
  it("saves, with no priority or assignee for a row", () => {
    expect(formProblem(formOf(signUp()))).toBeNull()
    const tidy = tidyForm(formOf(signUp()))
    expect(tidy.priority).toBe("medium")
    expect(tidy.assignee_uuid).toBeUndefined()
    expect(tidy.target_table).toBe(uuid(99))
  })

  it("refuses what the server refuses", () => {
    const bad: [FormField[], string][] = [
      [[...signUp(), { id: "x", label: "Notes", type: "long_text", required: false }], "Question 8 needs the column it fills."],
      [[...signUp(), { id: "x", label: "Urgency", type: "select", required: false, options: ["a", "b"], maps_to: "priority", map: { a: "high", b: "low" } }], "Question 8 needs the column it fills."],
      [[...signUp(), { id: "x", label: "Also the name", type: "short_text", required: false, maps_to: fills("Name") }], "Question 8 fills what another question already fills."],
      [[...signUp(), { id: "x", label: "Brochure", type: "file", required: false }], "Question 8 asks for files, which a table row can't keep yet."],
    ]
    for (const [fields, message] of bad) expect(formProblem(formOf(fields))?.message).toBe(message)
  })

  it("fills no column from a form that makes tasks", () => {
    const task: ProjectForm = { ...formOf([{ id: "a", label: "A", type: "short_text", required: false, maps_to: fills("Name") }]), target_table: undefined }
    expect(formProblem(task)?.message).toBe("Question 1 fills something a form can't fill.")
  })
})

describe("a form that adds rows is checked against its table (TestAFormThatAddsRowsIsCheckedAgainstItsTable)", () => {
  const problem = (fields: FormField[]) => formProblem(formOf(fields), undefined, columns)?.message

  it("saves the sign-up form", () => {
    expect(problem(signUp())).toBeUndefined()
  })

  it("refuses what the server refuses", () => {
    const change = (f: (x: FormField[]) => FormField[]) => problem(f(signUp()))
    expect(change((f) => { f[3].maps_to = `column:${uuid(50)}`; return f })).toBe("“Budget” fills a column that table doesn't have.")
    expect(change((f) => { f[3].type = "short_text"; return f })).toBe("“Budget” can't fill Budget: ask it as a number.")
    expect(change((f) => { f[6] = { ...f[6], type: "short_text", maps_to: fills("Owner") }; return f })).toBe("A form can't fill Owner.")
    expect(change((f) => { f[6] = { ...f[6], type: "short_text", maps_to: fills("Score") }; return f })).toBe("A form can't fill Score.")
    expect(change((f) => { f[0].required = false; return f })).toBe("Every row of the table needs Name: add a question for it that is always asked and required.")
    expect(change((f) => [{ id: "x", label: "X", type: "short_text", required: false }, { ...f[0], show_if: { question: "x", op: "answered" } }, ...f.slice(1)]))
      .toBe("Question 1 needs the column it fills.")
    expect(change((f) => [{ ...f[5], id: "x" }, { id: "s", label: "About you", type: "section", required: false, show_if: { question: "x", op: "is", values: ["Yes"] } }, ...f.slice(0, 5), f[6]]))
      .toBe("Every row of the table needs Name: add a question for it that is always asked and required.")
    expect(change((f) => f.slice(1))).toBe("Every row of the table needs Name: add a question for it that is always asked and required.")
    const thin = columns.map((c) => (c.name === "Tier" ? { ...c, options: ["Gold"] } : c))
    expect(formProblem(formOf(signUp()), undefined, thin)?.message).toBe("Tier needs 2 to 50 options for a form to offer.")
  })
})

describe("the columns a question can fill", () => {
  it("are those of its kind; a person, a link or a worked-out column takes none", () => {
    const words: FormField = { id: "w", label: "W", type: "short_text", required: false }
    expect(columnTargets(words, [words], columns).map((t) => t.label)).toEqual(["Name"])
    const mail: FormField = { id: "m", label: "M", type: "email", required: false }
    expect(columnTargets(mail, [mail], columns).map((t) => t.label)).toEqual(["Name", "Email"])
    const pick: FormField = { id: "p", label: "P", type: "select", required: false, options: ["a", "b"] }
    expect(columnTargets(pick, [pick], columns).map((t) => t.label)).toEqual(["Tier", "Services"])
  })

  it("say which another question already fills", () => {
    const fields = signUp()
    const other: FormField = { id: "x", label: "X", type: "short_text", required: false }
    expect(columnTargets(other, [...fields, other], columns).find((t) => t.label === "Name")?.taken).toBe("“Company” fills it")
  })
})
