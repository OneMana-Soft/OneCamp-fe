import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import type { TaskField } from "@/lib/tasks/fields"

// A project's admin adds a formula field (J-F WEB): Formula is a kind in the
// fields dialog, written in the formula editor with the project's fields and
// the task's built-ins to hand, checked against the server as it's typed
// (POST /project/{p}/fields/preview), and saved with its formula.

const create = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve())
const update = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve())
const preview = vi.fn<(...a: unknown[]) => Promise<{ result: string; error?: string; values: unknown[] }>>(() => Promise.resolve({ result: "number", values: [] }))
let fields: TaskField[] = []
const builtins = [
  { id: "due", name: "Due", result: "date" },
  { id: "points", name: "Points", result: "number" },
]

vi.mock("@/hooks/useProjectFields", () => ({
  useProjectFields: () => ({ fields, builtins, create, update, preview, remove: vi.fn(), reorder: vi.fn(() => Promise.resolve()) }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
// The kind's menu as a plain select: Radix's needs a real pointer.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select aria-label="Kind of field" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}))

const { ProjectFieldsDialog } = await import("@/components/project/ProjectFieldsDialog")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  fields = []
})

const spend: TaskField = { id: "s", project_id: "p", name: "Spend", type: "money", currency: "INR", options: [], on_card: false, position: 0, filter_id: "field_s" }

describe("a formula field in the fields dialog", () => {
  it("offers Formula, writes it with the fields and built-ins to hand, and adds it with its formula", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fields = [spend]
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    expect(screen.getByRole("option", { name: "formula" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Kind of field"), { target: { value: "formula" } })
    fireEvent.change(screen.getByLabelText("New field name"), { target: { value: "Spend x 2" } })
    const add = screen.getByRole("button", { name: "Add field" }) as HTMLButtonElement
    expect(add.disabled, "no formula yet").toBe(true)

    // The project's fields and the task's built-ins, each a chip that puts it in.
    const editor = document.querySelector("[data-formula-editor]")!
    expect(editor).toBeTruthy()
    for (const name of ["Spend", "Due", "Points"]) expect(screen.getByRole("button", { name })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Spend" }))
    const box = screen.getByRole("textbox", { name: /formula/i })
    fireEvent.change(box, { target: { value: "{Spend} * 2" } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(preview).toHaveBeenCalledWith("{Spend} * 2", undefined)
    // No sample values yet (V-763): words, never a blank box.
    expect(document.querySelector("[data-formula-preview]")!.textContent).toMatch(/Gives a number.*once tasks have them/)

    expect(add.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(add)
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Spend x 2", type: "formula", formula: "{Spend} * 2" }))
    vi.useRealTimers()
  })

  it("changes a saved formula's text, and only its text", async () => {
    fields = [spend, { ...spend, id: "d", name: "Spend x 2", type: "formula", formula: "{Spend} * 2", result: "number", position: 1, filter_id: "field_d" }]
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Edit Spend x 2's formula" }))
    const box = screen.getByRole("textbox", { name: /formula/i })
    expect((box as HTMLTextAreaElement).value).toBe("{Spend} * 2")
    fireEvent.change(box, { target: { value: "{Spend} * 3" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save formula" }))
    })
    expect(update).toHaveBeenCalledWith("d", expect.objectContaining({ name: "Spend x 2", formula: "{Spend} * 3" }))
  })
  it("keeps one editor open: the add form folds away while a row is open, and Save holds on a formula the server can't work out", async () => {
    const ok = { result: "number", values: [] }
    preview.mockImplementation((f: unknown) => Promise.resolve(f === "{Nope} * 2" ? { ...ok, error: "There's no field named Nope" } : ok))
    fields = [spend, { ...spend, id: "d", name: "Spend x 2", type: "formula", formula: "{Spend} * 2", result: "number", position: 1, filter_id: "field_d" }]
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    expect(screen.getByLabelText("New field name")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Edit Spend x 2's formula" }))
    expect(screen.queryByLabelText("New field name")).toBeNull()
    fireEvent.change(screen.getByRole("textbox", { name: /formula/i }), { target: { value: "{Nope} * 2" } })
    await waitFor(() => expect(document.querySelector("[data-formula-preview]")!.textContent).toContain("There's no field named Nope"))
    expect((screen.getByRole("button", { name: "Save formula" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Delete Spend" }))
    expect(screen.queryByLabelText("New field name")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByLabelText("New field name")).toBeTruthy()
    preview.mockImplementation(() => Promise.resolve(ok))
  })

  // CR-B55 N1: answers can come back out of order. Only the answer for the text last checked moves the hold, so an
  // older text's slow OK never lets Save formula take a newer text the server can't work out.
  it("keeps Save formula held on the text shown when an older text's answer comes in late", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const ok = { result: "number", values: [] }
    let lateOk = () => {}
    preview.mockImplementation((f: unknown) =>
      f === "{Spend} * 4" ? new Promise((done) => (lateOk = () => done(ok))) : Promise.resolve({ ...ok, error: "There's no field named Nope" }),
    )
    fields = [spend, { ...spend, id: "d", name: "Spend x 2", type: "formula", formula: "{Spend} * 2", result: "number", position: 1, filter_id: "field_d" }]
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Edit Spend x 2's formula" }))
    const box = screen.getByRole("textbox", { name: /formula/i })
    for (const text of ["{Spend} * 4", "{Nope} * 2"]) {
      fireEvent.change(box, { target: { value: text } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
    }
    expect(preview.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["{Spend} * 4", "{Nope} * 2"]))
    const save = screen.getByRole("button", { name: "Save formula" }) as HTMLButtonElement
    expect(save.disabled, "held on the text the server can't work out").toBe(true)
    await act(async () => lateOk())
    expect(save.disabled, "the older text's late OK leaves the hold on the text shown").toBe(true)
    preview.mockImplementation(() => Promise.resolve(ok))
    vi.useRealTimers()
  })
})
