import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import type { TaskField } from "@/lib/tasks/fields"
import type { TaskInfoInterface } from "@/types/task"

// V-698W: the server keeps a money field's values from anyone not an admin of
// its project and marks the field hidden: true for them. Wherever a list draws
// a field's value (the list's rows, the table's cells, through FieldValueView)
// such a field reads as the words, never as a value or an empty cell; an
// admin's reads as ever.

vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")
const { FieldValueView } = await import("@/components/task/fieldValue")
const { fieldHidden, readableFields } = await import("@/components/task/hiddenField")

const WORDS = "Only project admins see money"
const base = { project_id: "p", options: [], on_card: false, position: 0 }
const budget: TaskField = { ...base, id: "f-budget", name: "Budget", type: "money", currency: "INR", filter_id: "field_b" }
const channel: TaskField = { ...base, id: "f-channel", name: "Channel", type: "select", filter_id: "field_c", options: [{ id: "o1", label: "Email", color: "sky" }] }

afterEach(cleanup)

// A value the device kept from before the server hid the field: never shown.
const task = { task_uuid: "1", task_name: "Print the flyers", task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "", task_fields: { "f-budget": 1250000, "f-channel": "o1" } } as unknown as TaskInfoInterface

function list(fields: TaskField[]) {
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
  return render(
    <Provider store={store}>
      <GroupedTaskList tasks={[task]} options={BUILT_IN_STATUSES} grouping="status" props={[...PROJECT_PROPS, "field:f-budget", "field:f-channel"]} canEdit={() => true} projectId="p" fields={fields} />
    </Provider>,
  )
}

describe("a list's cells of a field the server hides from its reader (V-698W)", () => {
  it("read as the words in place of any value; an admin's read as the value", () => {
    render(<FieldValueView field={{ ...budget, hidden: true }} value={1250000} />)
    expect(screen.getByText(WORDS)).toBeTruthy()
    expect(screen.queryByText(/12,500/)).toBeNull()
    cleanup()
    render(<FieldValueView field={{ ...channel, hidden: true }} value={undefined} />)
    expect(screen.getByText(WORDS)).toBeTruthy()
    cleanup()
    render(<FieldValueView field={{ ...budget, hidden: false }} value={1250000} />)
    expect(screen.getByText(/12,500/)).toBeTruthy()
    expect(screen.queryByText(WORDS)).toBeNull()
  })

  it("in the list's rows: the money column and a choice's column each say so, and show nothing kept", () => {
    const { container } = list([
      { ...budget, hidden: true },
      { ...channel, hidden: true },
    ])
    expect(screen.getByText("Print the flyers")).toBeTruthy()
    expect(container.querySelectorAll("[data-field-hidden]")).toHaveLength(2)
    expect(screen.getAllByText(WORDS)).toHaveLength(2)
    expect(screen.queryByText(/12,500/)).toBeNull()
    expect(screen.queryByText("Email")).toBeNull()
  })

  it("in an admin's rows: the values, as ever", () => {
    const { container } = list([
      { ...budget, hidden: false },
      { ...channel, hidden: false },
    ])
    expect(container.querySelectorAll("[data-field-hidden]")).toHaveLength(0)
    expect(screen.getByText(/12,500/)).toBeTruthy()
    expect(screen.getByText("Email")).toBeTruthy()
  })
})

describe("the rule: a field the server hides from its reader (V-698W)", () => {
  it("is hidden only when the server says so, whatever its type", () => {
    expect(fieldHidden({ ...budget, hidden: true })).toBe(true)
    expect(fieldHidden({ ...channel, hidden: true })).toBe(true)
    // An admin's money field, and one from a server that doesn't say: shown as ever.
    expect(fieldHidden({ ...budget, hidden: false })).toBe(false)
    expect(fieldHidden(budget)).toBe(false)
  })

  it("is left out of what a reader is offered, the rest in order", () => {
    const fields = [{ ...channel, id: "a" }, { ...budget, id: "b", hidden: true }, { ...budget, id: "c", hidden: false }]
    expect(readableFields(fields).map((f) => f.id)).toEqual(["a", "c"])
  })
})
