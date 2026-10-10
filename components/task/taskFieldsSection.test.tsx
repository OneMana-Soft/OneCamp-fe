import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { TaskField } from "@/lib/tasks/fields"

const post = vi.fn<(...a: unknown[]) => Promise<{ data: { data: { value: unknown } } }>>(() => Promise.resolve({ data: { data: { value: null } } }))
const setField = vi.fn()
const toast = vi.fn()
let fields: TaskField[] = []
let canManage = true

vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a) }, OWN_ERRORS: {} }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ optimisticSetTaskField: (...a: unknown[]) => setField(...a) }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: () => Promise.resolve() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const refreshFields = vi.fn()
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields, canEdit: canManage, isLoading: false, refresh: refreshFields }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/project/ProjectFieldsDialog", () => ({ ProjectFieldsDialog: ({ open }: { open: boolean }) => (open ? <div>Fields dialog</div> : null) }))

const { TaskFieldsSection } = await import("@/components/task/taskFieldsSection")

const base = { project_id: "p", options: [], on_card: false, position: 0 }
const channel: TaskField = {
  ...base,
  id: "f-channel",
  name: "Channel",
  type: "select",
  filter_id: "field_x1",
  options: [
    { id: "aaaa1111", label: "Blog", color: "violet" },
    { id: "bbbb2222", label: "Email", color: "sky" },
  ],
}
const budget: TaskField = { ...base, id: "f-budget", name: "Budget", type: "money", currency: "INR", filter_id: "field_x2" }
const signed: TaskField = { ...base, id: "f-signed", name: "Signed off", type: "checkbox", filter_id: "field_x3" }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  fields = []
  canManage = true
})

describe("TaskFieldsSection", () => {
  it("shows each field's value to someone who can't change it", () => {
    fields = [channel, budget]
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-channel": "bbbb2222", "f-budget": 1250000 }} canEdit={false} members={[]} />)
    expect(screen.getByText("Email")).toBeTruthy()
    expect(screen.getByText(/12,500/)).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("saves money typed in units as cents, shown at once and merged into the task's values", async () => {
    fields = [budget]
    post.mockResolvedValueOnce({ data: { data: { value: 990050 } } })
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{}} canEdit members={[]} />)
    const box = screen.getByLabelText("Budget")
    fireEvent.change(box, { target: { value: "9,900.50" } })
    await act(async () => {
      fireEvent.blur(box)
    })
    expect(setField).toHaveBeenCalledWith("t", "p", "f-budget", 990050)
    expect(post).toHaveBeenCalledWith("/task/field", { task_uuid: "t", field_id: "f-budget", value: 990050 }, expect.anything())
  })

  it("puts a value back and says so when the server refuses it", async () => {
    fields = [signed]
    post.mockRejectedValueOnce(new Error("no"))
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{}} canEdit members={[]} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "Signed off" }))
    })
    expect(setField).toHaveBeenNthCalledWith(1, "t", "p", "f-signed", true)
    expect(setField).toHaveBeenLastCalledWith("t", "p", "f-signed", null)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Signed off wasn't saved" }))
    // The field may have changed under the panel: it's read again.
    expect(refreshFields).toHaveBeenCalled()
  })

  it("doesn't save a typed value that isn't one", async () => {
    fields = [budget]
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-budget": 100 }} canEdit members={[]} />)
    const box = screen.getByLabelText("Budget") as HTMLInputElement
    fireEvent.change(box, { target: { value: "lots" } })
    await act(async () => {
      fireEvent.blur(box)
    })
    expect(post).not.toHaveBeenCalled()
    expect(box.value).toBe("1")
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Budget wasn't changed" }))
  })

  it("offers an admin a first field, and nobody else an empty section", () => {
    const { unmount } = render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{}} canEdit={false} members={[]} />)
    expect(screen.queryByText("Fields")).toBeNull()
    unmount()
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{}} canEdit members={[]} />)
    fireEvent.click(screen.getByRole("button", { name: /Add a field/ }))
    expect(screen.getByText("Fields dialog")).toBeTruthy()
  })
})

describe("saves of one field in quick succession", () => {
  it("lets only the newest save settle the value, whatever order the answers come in", async () => {
    fields = [channel]
    let answerFirst: (v: { data: { data: { value: unknown } } }) => void = () => {}
    post
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce({ data: { data: { value: "bbbb2222" } } })
    const { rerender } = render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{}} canEdit members={[]} />)
    const { TaskFieldsSection: Section } = await import("@/components/task/taskFieldsSection")
    // Two picks: Blog, then Email before Blog's answer is back.
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Channel" }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Blog" }))
    })
    rerender(<Section taskUUID="t" projectUUID="p" values={{ "f-channel": "aaaa1111" }} canEdit members={[]} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Channel" }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Email" }))
    })
    // Blog's answer arrives last: it mustn't put Blog back.
    await act(async () => {
      answerFirst({ data: { data: { value: "aaaa1111" } } })
    })
    expect(setField).toHaveBeenLastCalledWith("t", "p", "f-channel", "bbbb2222")
  })
})

describe("the panel's values read one way", () => {
  // Estimate and Budget were bordered inputs and a select field a bordered
  // box, beside dates and people that read as plain text with a hover tint.
  const boxed = (el: Element) => /(^|\s)border-input(\s|$)/.test(el.className) && !/border-transparent/.test(el.className)
  const dueOn: TaskField = { ...base, id: "f-due", name: "Launch day", type: "date", filter_id: "field_x4" }

  it("draws no box around a value until it's being typed in", () => {
    fields = [channel, budget, dueOn]
    const { container } = render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-channel": "aaaa1111" }} canEdit members={[]} />)
    const controls = container.querySelectorAll("input, button[role=combobox], button")
    expect(controls.length).toBeGreaterThan(0)
    for (const c of controls) expect(boxed(c)).toBe(false)
  })

  it("picks a date field's day with the panel's own date control, not the browser's date box", () => {
    fields = [dueOn]
    const { container } = render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{ "f-due": "2026-10-14" }} canEdit members={[]} />)
    expect(container.querySelector('input[type="date"]')).toBeNull()
    expect(screen.getByRole("button", { name: "Launch day: 14 Oct" })).toBeTruthy()
  })

  it("says what an empty value wants, and puts the currency beside an amount only", () => {
    fields = [channel, budget]
    render(<TaskFieldsSection taskUUID="t" projectUUID="p" values={{}} canEdit members={[]} />)
    expect(screen.getByText("Choose…")).toBeTruthy()
    expect((screen.getByLabelText("Budget") as HTMLInputElement).placeholder).toBe("Add an amount…")
    expect(screen.queryByText("INR")).toBeNull()
    fireEvent.focus(screen.getByLabelText("Budget"))
    expect(screen.getByText("INR")).toBeTruthy()
  })
})
