import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { TaskField } from "@/lib/tasks/fields"

const create = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve())
const update = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve())
const remove = vi.fn<(...a: unknown[]) => Promise<void>>(() => Promise.resolve())
let fields: TaskField[] = []

vi.mock("@/hooks/useProjectFields", () => ({
  useProjectFields: () => ({ fields, create, update, remove, reorder: vi.fn(() => Promise.resolve()) }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { ProjectFieldsDialog } = await import("@/components/project/ProjectFieldsDialog")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  fields = []
})

const channel: TaskField = {
  id: "c",
  project_id: "p",
  name: "Channel",
  type: "select",
  options: [
    { id: "aaaa1111", label: "Blog", color: "violet" },
    { id: "bbbb2222", label: "Email", color: "sky" },
  ],
  on_card: false,
  position: 0,
  filter_id: "field_c",
}

describe("ProjectFieldsDialog", () => {
  it("adds a choice field only once it has options", async () => {
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText("New field name"), { target: { value: "Size" } })
    const add = screen.getByRole("button", { name: "Add field" })
    expect((add as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Add its options first/)).toBeTruthy()
    for (const label of ["S", "M"]) {
      fireEvent.change(screen.getByLabelText("New option"), { target: { value: label } })
      fireEvent.keyDown(screen.getByLabelText("New option"), { key: "Enter" })
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add field" }))
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Size", type: "select", options: [expect.objectContaining({ label: "S" }), expect.objectContaining({ label: "M" })] }),
    )
  })

  it("asks before taking an option off every task that has it", async () => {
    fields = [channel]
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Remove Blog" }))
    expect(update).not.toHaveBeenCalled()
    expect(screen.getByText(/comes off every task that has it/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove option" }))
    })
    expect(update).toHaveBeenCalledWith("c", expect.objectContaining({ options: [expect.objectContaining({ id: "bbbb2222" })] }))
  })

  // The server keeps an option a save doesn't list, and takes out only those
  // named: a removal that named nothing would have kept the option.
  it("names the option it takes out, by id, and only when one goes", async () => {
    fields = [channel]
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Remove Blog" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove option" }))
    })
    expect(update).toHaveBeenLastCalledWith("c", expect.objectContaining({ removed_options: ["aaaa1111"] }))
    const email = screen.getAllByLabelText("Option name").find((el) => (el as HTMLInputElement).value === "Email") as HTMLInputElement
    fireEvent.change(email, { target: { value: "Newsletter" } })
    await act(async () => {
      fireEvent.blur(email)
    })
    expect(update.mock.lastCall?.[1]).not.toHaveProperty("removed_options")
  })

  it("renames a field on blur, and shows it on cards when asked", async () => {
    fields = [channel]
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    const name = screen.getByLabelText("Field name")
    fireEvent.change(name, { target: { value: "Where it goes out" } })
    await act(async () => {
      fireEvent.blur(name)
    })
    expect(update).toHaveBeenCalledWith("c", expect.objectContaining({ name: "Where it goes out", type: "select" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Show Channel on cards" }))
    })
    expect(update).toHaveBeenLastCalledWith("c", expect.objectContaining({ on_card: true }))
  })
})

describe("a new field's options", () => {
  it("keep their own names when one before them is removed", async () => {
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.change(screen.getByLabelText("New field name"), { target: { value: "Channel" } })
    for (const label of ["Blog", "Email", "Social"]) {
      fireEvent.change(screen.getByLabelText("New option"), { target: { value: label } })
      fireEvent.keyDown(screen.getByLabelText("New option"), { key: "Enter" })
    }
    fireEvent.click(screen.getByRole("button", { name: "Remove Blog" }))
    const names = screen.getAllByLabelText("Option name").map((el) => (el as HTMLInputElement).value)
    expect(names).toEqual(["Email", "Social"])
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add field" }))
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ options: [expect.objectContaining({ label: "Email" }), expect.objectContaining({ label: "Social" })] }))
    // Only what the server takes is sent: no draft keys.
    const sent = (create.mock.calls[0] as unknown[])[0] as { options: object[] }
    expect(Object.keys(sent.options[0]).sort()).toEqual(["color", "id", "label"])
  })
})

describe("a field's kind (work.md W47)", () => {
  it("shows as a tile with its icon, then its name", async () => {
    const { FieldKind } = await import("@/components/project/ProjectFieldsDialog")
    render(<FieldKind type="money" />)
    const kind = document.querySelector("[data-field-kind='money']")!
    expect(kind.querySelector("svg")).not.toBeNull()
    expect(kind.textContent).toBe("Money")
  })
})

// One press, one thing (rule 7; lib/keys/escapeOwn): Esc in a field's name
// being changed puts the name back and leaves the dialog open; with nothing
// to put back, Esc closes it.
describe("Esc in a field's name", () => {
  it("puts the name back first, and closes the dialog on the next press", () => {
    fields = [channel]
    const onOpenChange = vi.fn()
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={onOpenChange} />)
    const name = screen.getByLabelText("Field name")
    fireEvent.change(name, { target: { value: "Where it goes out" } })
    fireEvent.keyDown(name, { key: "Escape" })
    expect((name as HTMLInputElement).value).toBe("Channel")
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(name, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// The same for a choice's name (components/fields/OptionsEditor), which said
// "a menu or dialog it sits in closes as well".
describe("Esc in an option's name", () => {
  it("puts the name back first, and closes the dialog on the next press", () => {
    fields = [channel]
    const onOpenChange = vi.fn()
    render(<ProjectFieldsDialog projectId="p" open onOpenChange={onOpenChange} />)
    const blog = screen.getAllByLabelText("Option name").find((el) => (el as HTMLInputElement).value === "Blog") as HTMLInputElement
    fireEvent.change(blog, { target: { value: "Blogs" } })
    fireEvent.keyDown(blog, { key: "Escape" })
    expect(blog.value).toBe("Blog")
    expect(onOpenChange).not.toHaveBeenCalled()
    fireEvent.keyDown(blog, { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
