import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactElement } from "react"
import type { FormField, ProjectForm, Submission } from "@/lib/forms/forms"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import type { TaskField } from "@/lib/tasks/fields"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const post = vi.fn(async (_url: string, body?: unknown) => ({ data: { data: { ...(body as object), token: "tok1" } } }))
const get = vi.fn<(url: string, config?: unknown) => Promise<unknown>>(async () => ({ data: { msg: "ok", url: "https://files.test/a" } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { post: (...a: unknown[]) => post(...(a as [string, unknown])), get: (...a: unknown[]) => get(...(a as [string, unknown])) } }))
const dispatch = vi.fn()
vi.mock("react-redux", () => ({ useDispatch: () => dispatch, useSelector: () => undefined }))
const form = (over: Partial<ProjectForm>): ProjectForm =>
  ({ id: "f1", token: "tok1", title: "Launch requests", description: "", active: true, priority: "medium", title_field: "q1", fields: [{ id: "q1", label: "What?", type: "short_text", required: true }], submissions: 3, ...over }) as ProjectForm
let forms: ProjectForm[] = [form({})]
let fields: TaskField[] = []
let submissions: Submission[] = []
// The workspace's tables, and each one's columns (GET /tables, /tables/{id}/fields).
let tables: { id: string; name: string; visibility: string }[] = []
let columns: Record<string, unknown[]> = {}
const mutate = vi.fn()
let readFailed = false
// SWR keeps what a read brought through a failed refresh.
let keptForms = false
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    !url
      ? { data: undefined, isLoading: false, mutate }
      : url === "/tables"
      ? { data: { data: tables }, isLoading: false, mutate }
      : url.startsWith("/tables/") && url.endsWith("/forms")
      ? { data: { data: { forms, can_edit: true } }, isLoading: false, mutate }
      : url.startsWith("/tables/") && !url.endsWith("/submissions")
      ? { data: { data: columns[url.split("/")[2]] ?? [] }, isLoading: false, mutate }
      : url.endsWith("/submissions")
      ? { data: { data: { submissions, total: submissions.length } }, isLoading: false, mutate }
      : url.endsWith("/fields")
      ? { data: { data: { fields, can_edit: true } }, isLoading: false, mutate }
      : readFailed
      ? { data: keptForms ? { data: { forms, can_edit: true } } : undefined, isLoading: false, isError: new Error("Request failed with status code 500"), mutate }
      : { data: { data: { forms, can_edit: true } }, isLoading: false, mutate },
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toast(t), useToast: () => ({ toast }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

const { ProjectFormsDialog, TableFormsDialog } = await import("@/components/project/ProjectFormsDialog")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  forms = [form({})]
  fields = []
  submissions = []
  tables = []
  columns = {}
  readFailed = false
  keptForms = false
})

/** The demo's form, as the project's admins read it: a bug opens its steps, and "About you" is a page. */
const launch = (): ProjectForm =>
  form({
    fields: [
      { id: "what", label: "What do you need?", type: "short_text", required: true },
      { id: "kind", label: "What kind of request is it?", type: "select", required: false, options: ["Copy", "Design", "A bug"], maps_to: "tags" },
      { id: "steps", label: "How do we see the bug?", type: "long_text", required: true, show_if: { question: "kind", op: "is", values: ["A bug"] } },
      { id: "about", label: "About you", type: "section", required: false, help: "So we know who to follow up with." },
      { id: "team", label: "Your team", type: "select", required: false, options: ["Sales", "Support"] },
    ],
    title_field: "what",
  })

async function open() {
  await act(async () => {
    render(<ProjectFormsDialog projectId="p" open onOpenChange={() => {}} />)
  })
}

async function edit() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Edit Launch requests/ })))
}

/** Picks an option from one of the app's selects, by keyboard. */
async function pick(inside: HTMLElement, name: RegExp | string, option: RegExp | string) {
  const trigger = within(inside).getByRole("combobox", { name })
  await act(async () => {
    trigger.focus()
    fireEvent.keyDown(trigger, { key: "Enter" })
  })
  const choice = await screen.findByRole("option", { name: option })
  await act(async () => fireEvent.keyDown(choice, { key: "Enter" }))
}

/** An item's card in the editor, opened. */
async function card(name: RegExp | string) {
  const toggle = screen.getByRole("button", { name })
  if (toggle.getAttribute("aria-expanded") !== "true") await act(async () => fireEvent.click(toggle))
  return screen.getByRole("group", { name })
}

/** What the last save sent. */
const saved = () => post.mock.calls.at(-1)![1] as ProjectForm
const item = (f: ProjectForm, id: string) => f.fields.find((x) => x.id === id) as FormField

describe("a project's forms", () => {
  it("lists each with its questions, pages and answers", async () => {
    forms = [launch()]
    await open()
    const row = document.querySelector("[data-form-row='f1']") as HTMLElement
    expect(row.textContent).toContain("Launch requests")
    // Each fact a whole: never "4 questions · 2" on one line and "pages" on the next.
    expect(within(row).getByText("4 questions").className).toContain("whitespace-nowrap")
    expect(within(row).getByText("2 pages").className).toContain("whitespace-nowrap")
    expect(within(row).getByRole("button", { name: "3 answers" })).toBeTruthy()
  })

  it("focuses the dialog itself, not its first button, so nothing lights up before a key is pressed", async () => {
    await open()
    expect(document.activeElement?.getAttribute("role")).toBe("dialog")
  })

  it("keeps New form in the dialog's footer", async () => {
    await open()
    expect(screen.getByRole("button", { name: /New form/ }).closest("[data-dialog-footer]")).not.toBeNull()
  })
})

// Web Q5 (the audit): a read that failed showed "No forms yet", as if the
// project had none.
describe("a read of the forms that failed", () => {
  it("says they couldn't load, with Try again, not that there are none", async () => {
    readFailed = true
    await open()
    expect(screen.getByText("Couldn't load this project's forms")).toBeTruthy()
    expect(screen.queryByText(/No forms yet/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("keeps the forms it read when a refresh fails", async () => {
    readFailed = true
    keptForms = true
    await open()
    expect(document.querySelector("[data-form-row='f1']")?.textContent).toContain("Launch requests")
    expect(screen.queryByText("Couldn't load this project's forms")).toBeNull()
  })
})

describe("deleting a form", () => {
  async function remove() {
    const more = screen.getByRole("button", { name: "More for Launch requests" })
    await act(async () => {
      more.focus()
      fireEvent.keyDown(more, { key: "Enter" })
    })
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" })))
  }

  it("asks first, saying the link stops and the tasks stay", async () => {
    await open()
    await remove()
    expect(post).not.toHaveBeenCalled()
    const asked = confirm.mock.calls[0][0]
    expect(asked.title).toBe("Delete the form “Launch requests”?")
    expect(asked.description).toContain("Its link stops working for anyone who has it.")
    expect(asked.description).toContain("The 3 tasks its answers made stay in the project.")
    // Its toast's Undo brings it back, so it never says it can't.
    expect(asked.description).not.toContain("can't be undone")
    expect(asked.destructive).toBe(true)
    expect(asked.confirmText).toBe("Delete form")
  })

  it("says so when nobody has answered", async () => {
    forms = [form({ submissions: 0 })]
    await open()
    await remove()
    expect(confirm.mock.calls[0][0].description).toContain("Nobody has answered it yet.")
  })

  it("deletes only when confirmed", async () => {
    await open()
    await remove()
    expect(post).not.toHaveBeenCalled()
    await act(async () => {
      await confirm.mock.calls[0][0].onConfirm()
    })
    // Its failure is the dialog's own toast's to say, not the global one's too.
    expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/f1\/delete$/), {}, OWN_ERRORS)
  })

  it("offers Undo once it's deleted, which brings the form back through /restore", async () => {
    await open()
    await remove()
    await act(async () => {
      await confirm.mock.calls[0][0].onConfirm()
    })
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Deleted") })))
    const offered = toast.mock.calls.at(-1)?.[0] as { title: string; description?: string; action?: ReactElement<{ altText: string; onClick: () => unknown }> }
    expect(offered).toMatchObject({ title: "Deleted “Launch requests”", description: "Tasks it made stay in the project." })
    expect(offered.action?.props.altText).toBe("Undo")
    await act(async () => {
      await offered.action?.props.onClick()
    })
    expect(post).toHaveBeenLastCalledWith("/restore/form/f1", {}, OWN_ERRORS)
  })
})

describe("building a form", () => {
  it("adds a section, which starts a page, and won't save one with nothing in it", async () => {
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /New form/ })))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Design requests " } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add a section/ })))
    const section = screen.getByRole("group", { name: /^Section/ })
    fireEvent.change(within(section).getByLabelText("Section title"), { target: { value: "About you" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create form" })))
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("The section “About you” needs a question in it.")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Add a question/ })))
    fireEvent.change(within(screen.getByRole("group", { name: /^Question 4/ })).getByLabelText("Question"), { target: { value: "Your team" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create form" })))
    const body = saved()
    expect(post.mock.calls.at(-1)![0]).toMatch(/\/project\/p\/forms$/)
    expect(body.title).toBe("Design requests")
    expect(body.fields.map((f) => [f.type, f.label])).toEqual([
      ["short_text", "What do you need?"], ["email", "Your email"], ["long_text", "Details"], ["section", "About you"], ["short_text", "Your team"],
    ])
  })

  it("shows a question only on an earlier answer", async () => {
    forms = [launch()]
    await open()
    await edit()
    const team = await card(/^Question 4/)
    await pick(team, "Shows", /Only when/)
    await pick(team, "On the answer to", "What kind of request is it?")
    await pick(team, "Choice it shows on", "Design")
    expect(within(team).getByText("Shows when ‘What kind of request is it?’ is Design")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(item(saved(), "team").show_if).toEqual({ question: "kind", op: "is", values: ["Design"] })
  })

  it("lets a choice set the priority, with a pick for each choice", async () => {
    forms = [launch()]
    await open()
    await edit()
    const kind = await card(/^Question 2/)
    await pick(kind, "Fills", "The priority")
    await pick(kind, "Priority for Copy", "Low")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(item(saved(), "kind")).toMatchObject({ maps_to: "priority", map: { Copy: "low", Design: "medium", "A bug": "low" } })
  })

  it("offers the project's fields of a fitting kind, and a choice takes the field's options", async () => {
    fields = [
      { id: "22222222-2222-4222-8222-222222222222", project_id: "p", name: "Stage", type: "select", options: [{ id: "o1", label: "Draft", color: "" }, { id: "o2", label: "Live", color: "" }], on_card: false, position: 0, filter_id: "" },
      { id: "33333333-3333-4333-8333-333333333333", project_id: "p", name: "Launch", type: "date", options: [], on_card: false, position: 1, filter_id: "" },
    ]
    forms = [launch()]
    await open()
    await edit()
    const team = await card(/^Question 4/)
    const fills = within(team).getByRole("combobox", { name: "Fills" })
    await act(async () => {
      fills.focus()
      fireEvent.keyDown(fills, { key: "Enter" })
    })
    expect(screen.queryByRole("option", { name: "Launch" })).toBeNull()
    await act(async () => fireEvent.keyDown(await screen.findByRole("option", { name: "Stage" }), { key: "Enter" }))
    expect(within(team).getByText(/Its choices are Stage's options/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(item(saved(), "team")).toMatchObject({ maps_to: "field:22222222-2222-4222-8222-222222222222", options: ["Draft", "Live"] })
  })

  it("won't move a question above the answer it shows on, and says why", async () => {
    forms = [launch()]
    await open()
    await edit()
    const steps = await card(/^Question 3/)
    const up = within(steps).getByRole("button", { name: "Move up" })
    expect(up.getAttribute("aria-disabled")).toBe("true")
    expect(up.getAttribute("data-disabled-reason")).toBe("“How do we see the bug?” shows on “What kind of request is it?”'s answer, so it comes after it.")
  })

  it("lets go of the conditions on a question taken out, and says so", async () => {
    forms = [launch()]
    await open()
    await edit()
    const kind = await card(/^Question 2/)
    await act(async () => fireEvent.click(within(kind).getByRole("button", { name: "Remove this question" })))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "“How do we see the bug?” shows to everyone now" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(item(saved(), "steps").show_if).toBeUndefined()
  })

  it("keeps the form's own words for after sending, with Save in the footer", async () => {
    forms = [launch()]
    await open()
    await edit()
    fireEvent.change(screen.getByLabelText("After sending"), { target: { value: "Thanks! It's on our board." } })
    const save = screen.getByRole("button", { name: "Save" })
    expect(save.closest("[data-dialog-footer]")).not.toBeNull()
    await act(async () => fireEvent.click(save))
    expect(saved().confirmation).toBe("Thanks! It's on our board.")
  })

  // DB-28 (28 Oct): the preview drew its Next and Send as outline buttons and
  // the visitor's page the filled one; the preview is the visitor's form.
  it("draws the preview's Next filled, as the visitor's page does", async () => {
    forms = [launch()]
    await open()
    await edit()
    const next = within(screen.getByRole("complementary", { name: "Preview" })).getByRole("button", { name: "Next" })
    expect(next.className).toContain("bg-brand")
  })
})

describe("a form's answers", () => {
  it("lists the latest by question, old ones read by label, each with its task", async () => {
    forms = [launch()]
    submissions = [
      { id: "s2", task_uuid: "t2", created_at: new Date().toISOString(), answers: [{ id: "what", label: "What do you need?", value: "A banner" }, { id: "kind", label: "What kind of request is it?", value: "A bug" }] },
      { id: "s1", task_uuid: "t1", created_at: "2026-10-01T10:00:00Z", answers: [{ Label: "What do you need?", Value: "A logo" }] },
    ]
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "3 answers" })))
    const list = screen.getByRole("list", { name: "Answers" })
    const [newest, oldest] = within(list).getAllByRole("listitem")
    expect(newest.textContent).toContain("What do you need?")
    expect(newest.textContent).toContain("A banner")
    expect(within(newest).getByRole("link", { name: /Open its task/ }).getAttribute("href")).toBe("/app/task/t2")
    expect(oldest.textContent).toContain("A logo")
  })

  it("adds up each choice across them", async () => {
    forms = [launch()]
    submissions = [
      { id: "s3", task_uuid: "t3", created_at: new Date().toISOString(), answers: [{ id: "kind", label: "What kind of request is it?", value: "A bug" }] },
      { id: "s2", task_uuid: "t2", created_at: new Date().toISOString(), answers: [{ id: "kind", label: "What kind of request is it?", value: "A bug" }] },
      { id: "s1", task_uuid: "t1", created_at: new Date().toISOString(), answers: [{ id: "kind", label: "What kind of request is it?", value: "Copy" }] },
    ]
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "3 answers" })))
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "By question" })))
    const kind = screen.getByRole("group", { name: "What kind of request is it?" })
    expect(within(kind).getByText("A bug").closest("li")!.textContent).toContain("2")
    expect(within(kind).getByText("Copy").closest("li")!.textContent).toContain("1")
  })
})

describe("the form preview (work.md W46)", () => {
  it("shows the form as it will look, saying which questions are required", async () => {
    const { FormPreview } = await import("@/components/project/ProjectFormsDialog")
    await act(async () => {
      render(
        <FormPreview
          form={{ title: "Design requests", description: "", fields: [{ id: "a", label: "What do you need?", type: "long_text", required: true }, { id: "b", label: "By when?", type: "date", required: false }] } as never}
        />,
      )
    })
    const pane = screen.getByRole("complementary", { name: "Preview" })
    expect(pane.textContent).toContain("Design requests")
    expect(pane.textContent).toContain("What do you need?Required")
    expect(pane.textContent).not.toContain("By when?Required")
  })

  it("walks the pages, checking nothing", async () => {
    const { FormPreview } = await import("@/components/project/ProjectFormsDialog")
    await act(async () => {
      render(<FormPreview form={launch()} />)
    })
    const pane = screen.getByRole("complementary", { name: "Preview" })
    expect(within(pane).getByText("Page 1 of 2")).toBeTruthy()
    await act(async () => fireEvent.click(within(pane).getByRole("button", { name: "Next" })))
    expect(within(pane).getByText("So we know who to follow up with.")).toBeTruthy()
  })
})

/** The Vendors table: a name every row needs, a contact every row needs too, a tier, and a worked-out spend. */
const VENDORS = "77777777-7777-4777-8777-777777777777"
const col = (id: number, name: string, type: string, over: Record<string, unknown> = {}) =>
  ({ id: `0000000${id}-0000-4000-8000-000000000000`, table_id: VENDORS, name, type, config: "{}", position: id, ...over })
const vendorColumns = () => [
  col(1, "Vendor", "text", { required: true, primary: true }),
  col(2, "Contact", "email", { required: true }),
  col(3, "Tier", "select", { config: JSON.stringify({ options: [{ id: "o1", label: "Gold" }, { id: "o2", label: "Silver" }] }) }),
  col(4, "Spend", "rollup", { config: JSON.stringify({ relation: "x", aggregate: "sum" }) }),
]
const columnId = (n: number) => `0000000${n}-0000-4000-8000-000000000000`

describe("a form that adds table rows (package 9 R4b)", () => {
  const withTables = () => {
    tables = [{ id: VENDORS, name: "Vendors", visibility: "workspace" }]
    columns = { [VENDORS]: vendorColumns() }
  }

  it("asks a question for each column a form can fill, and saves each filling its column", async () => {
    withTables()
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /New form/ })))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Vendor sign-up" } })
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "A table row" })))
    await pick(document.querySelector("[data-form-target]") as HTMLElement, "Table", "Vendors")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Ask for every column/ })))
    // Its questions are the columns', the untouched starting ones gone; a worked-out column asks nothing.
    expect(screen.queryByRole("button", { name: /What do you need/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Spend/ })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create form" })))
    const body = saved()
    expect(body.target_table).toBe(VENDORS)
    expect(body.fields.map((f) => [f.label, f.type, f.required, f.maps_to])).toEqual([
      ["Vendor", "short_text", true, `column:${columnId(1)}`],
      ["Contact", "email", true, `column:${columnId(2)}`],
      ["Tier", "select", false, `column:${columnId(3)}`],
    ])
    expect(item(body, body.fields[2].id).options).toEqual(["Gold", "Silver"])
  })

  it("says which columns every row needs, and adds a question for one", async () => {
    withTables()
    forms = [form({ target_table: VENDORS, fields: [{ id: "q1", label: "Company", type: "short_text", required: true, maps_to: `column:${columnId(1)}` }] })]
    await open()
    await edit()
    const needs = screen.getByRole("list", { name: "Every row needs" })
    expect(within(needs).getByRole("listitem", { name: /Vendor/ }).getAttribute("data-filled")).toBe("yes")
    const contact = within(needs).getByRole("listitem", { name: /Contact/ })
    expect(contact.getAttribute("data-filled")).toBe("no")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("Every row of the table needs Contact: add a question for it that is always asked and required.")
    await act(async () => fireEvent.click(within(contact).getByRole("button", { name: "Ask for it" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(saved().fields.at(-1)).toMatchObject({ label: "Contact", type: "email", required: true, maps_to: `column:${columnId(2)}` })
  })

  it("offers each question only the columns of its kind, and no task's priority or name", async () => {
    withTables()
    forms = [form({ target_table: VENDORS, fields: [{ id: "q1", label: "Company", type: "short_text", required: true, maps_to: `column:${columnId(1)}` }] })]
    await open()
    await edit()
    const company = await card(/^Question 1/)
    const fills = within(company).getByRole("combobox", { name: "Fills" })
    await act(async () => {
      fills.focus()
      fireEvent.keyDown(fills, { key: "Enter" })
    })
    expect(screen.queryByRole("option", { name: /Tier/ })).toBeNull()
    expect(screen.queryByRole("option", { name: /The priority/ })).toBeNull()
    expect(screen.getByRole("option", { name: /Vendor/ })).toBeTruthy()
    await act(async () => fireEvent.keyDown(screen.getByRole("option", { name: /Vendor/ }), { key: "Escape" }))
    expect(screen.queryByText("The task is named by")).toBeNull()
  })

  it("asks no files of a form that adds rows, and says why", async () => {
    withTables()
    forms = [form({ target_table: VENDORS, fields: [{ id: "q1", label: "Company", type: "short_text", required: true, maps_to: `column:${columnId(1)}` }] })]
    await open()
    await edit()
    const company = await card(/^Question 1/)
    const kind = within(company).getByRole("combobox", { name: "Kind" })
    await act(async () => {
      kind.focus()
      fireEvent.keyDown(kind, { key: "Enter" })
    })
    expect(screen.getByRole("option", { name: /Files/ }).getAttribute("aria-disabled")).toBe("true")
  })

  it("says in the list where each form's answers go, and that nobody has answered in plain words", async () => {
    withTables()
    forms = [form({ id: "f2", title: "Vendor sign-up", target_table: VENDORS, submissions: 0 })]
    await open()
    const row = document.querySelector("[data-form-row='f2']") as HTMLElement
    expect(within(row).getByText("Adds rows to Vendors")).toBeTruthy()
    expect(within(row).getByText("No answers yet").tagName).not.toBe("BUTTON")
  })

  it("never says every answer becomes a task, now a form can add a table row instead", async () => {
    await open()
    const dialog = screen.getByRole("dialog")
    expect(dialog.textContent).not.toMatch(/every answer arrives here as a task/i)
    expect(within(dialog).getByText(/each answer becomes a task here, or a row in a table/i)).toBeTruthy()
  })

  it("opens a row's submission in its table", async () => {
    withTables()
    forms = [form({ target_table: VENDORS })]
    submissions = [{ id: "s1", row_id: "r1", created_at: new Date().toISOString(), answers: [{ id: "q1", label: "Company", value: "Acme" }] }]
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "3 answers" })))
    expect(screen.getByRole("link", { name: /Open its row/ }).getAttribute("href")).toBe(`/app/tables/${VENDORS}?row=r1`)
  })
})

describe("a question that takes files (package 9 R4b)", () => {
  it("fills nothing, says where its files go, and saves as files", async () => {
    forms = [launch()]
    await open()
    await edit()
    const team = await card(/^Question 4/)
    await pick(team, "Kind", /Files/)
    expect(within(team).queryByRole("combobox", { name: "Fills" })).toBeNull()
    expect(within(team).getByText(/Its files go on the task/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    const shots = item(saved(), "team")
    expect(shots.type).toBe("file")
    expect(shots.options).toBeUndefined()
    expect(shots.maps_to).toBeUndefined()
  })

  // Design review (DESIGN-BUILD-4, 22 Oct): a sent file is shown as the app
  // shows a file, its kind's glyph, its name cut in the middle and its size,
  // and opens in the app's viewer on its task; one that can't open says why.
  const sent = () => {
    forms = [launch()]
    submissions = [{ id: "s1", task_uuid: "t1", created_at: new Date().toISOString(), answers: [{ id: "shots", label: "Screenshots", value: "checkout.png, Load test results.xlsx", values: ["checkout.png", "Load test results.xlsx"], files: [{ id: "a", name: "checkout.png", size: 2048, mime: "image/png" }, { id: "b", name: "Load test results.xlsx", size: 24064, mime: "application/vnd.ms-excel" }] }] }]
  }

  it("shows a submission's files as files: their kind, their name cut in the middle and their size", async () => {
    sent()
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "3 answers" })))
    const files = screen.getByRole("list", { name: "Screenshots" })
    const sheet = within(files).getByRole("button", { name: /^Open Load test results\.xlsx/ })
    expect(sheet.querySelector("[data-file-glyph]")).not.toBeNull()
    expect([...sheet.querySelectorAll("[data-middle-name] > span")].map((x) => x.textContent)).toEqual(["Load test", " results.xlsx"])
    expect(within(sheet).getByText("23.5 KB")).toBeTruthy()
  })

  it("opens a file in the app's viewer, on the project's files", async () => {
    sent()
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "3 answers" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Open checkout\.png/ })))
    expect(get).toHaveBeenCalledWith("/project/getFile/p/a", expect.objectContaining({ suppressErrorToast: true }))
    const opened = dispatch.mock.calls.at(-1)![0]
    expect(opened.payload.key).toBe("attachmentLightbox")
    expect(opened.payload.data.mediaGetUrl).toBe("/project/getFile/p")
    expect(opened.payload.data.media).toMatchObject({ attachment_uuid: "a", attachment_file_name: "checkout.png", attachment_type: "image", attachment_size: 2048, initial_url: "https://files.test/a" })
    expect(opened.payload.data.allMedia.map((m: { attachment_uuid: string }) => m.attachment_uuid)).toEqual(["a", "b"])
  })

  it("says at the file why it can't open, and opens nothing", async () => {
    sent()
    get.mockRejectedValueOnce({ response: { status: 404 } })
    await open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "3 answers" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Open checkout\.png/ })))
    expect(screen.getByText("It's no longer on its task.")).toBeTruthy()
    expect(dispatch.mock.calls.some(([a]) => a?.payload?.key === "attachmentLightbox")).toBe(false)
  })
})

describe("a table's own forms (tables B5)", () => {
  const openTable = async () => {
    columns = { [VENDORS]: vendorColumns() }
    await act(async () => {
      render(<TableFormsDialog tableId={VENDORS} tableName="Vendors" open onOpenChange={() => {}} />)
    })
  }

  it("lists them at the table's address and says each answer adds one of its rows", async () => {
    forms = [form({ id: "f2", target_table: VENDORS, submissions: 0 })]
    await openTable()
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText(/each answer adds a row to Vendors/i)).toBeTruthy()
    // The table is the forms' home: no "Adds rows to" line under each, and no task anywhere.
    const row = document.querySelector("[data-form-row='f2']") as HTMLElement
    expect(within(row).queryByText(/Adds rows to/)).toBeNull()
    expect(dialog.textContent).not.toMatch(/task/i)
    expect(document.querySelector("[data-table-forms]")).not.toBeNull()
  })

  it("starts a new form from the table's columns, never asks for a table or a task, and saves it at the table", async () => {
    forms = []
    await openTable()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /New form/ })))
    expect(screen.queryByRole("radio", { name: "A task" })).toBeNull()
    expect(screen.queryByRole("combobox", { name: "Table" })).toBeNull()
    expect(screen.getByText("Each answer adds a row to Vendors")).toBeTruthy()
    expect(screen.queryByText("The task is named by")).toBeNull()
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Vendor sign-up" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create form" })))
    expect(post.mock.calls.at(-1)![0]).toBe(`/tables/${VENDORS}/forms`)
    const body = saved()
    expect(body.target_table).toBe(VENDORS)
    expect(body.fields.map((f) => [f.label, f.type, f.required, f.maps_to])).toEqual([
      ["Vendor", "short_text", true, `column:${columnId(1)}`],
      ["Contact", "email", true, `column:${columnId(2)}`],
      ["Tier", "select", false, `column:${columnId(3)}`],
    ])
  })

  it("deletes one at the table's address, keeping the rows it added", async () => {
    forms = [form({ id: "f2", target_table: VENDORS, submissions: 2 })]
    await openTable()
    const more = screen.getByRole("button", { name: "More for Launch requests" })
    await act(async () => {
      more.focus()
      fireEvent.keyDown(more, { key: "Enter" })
    })
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" })))
    const asked = confirm.mock.calls.at(-1)![0] as { description: string; onConfirm: () => Promise<void> }
    expect(asked.description).toMatch(/The 2 rows its answers added stay in the table/)
    await act(async () => asked.onConfirm())
    expect(post.mock.calls.at(-1)![0]).toBe(`/tables/${VENDORS}/forms/f2/delete`)
  })
})
