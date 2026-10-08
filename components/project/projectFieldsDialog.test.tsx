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
