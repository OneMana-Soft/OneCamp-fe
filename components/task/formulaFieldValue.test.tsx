import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { FieldValueView } from "@/components/task/fieldValue"
import { GroupedTaskList, PROJECT_PROPS } from "@/components/task/GroupedTaskList"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import type { TaskField } from "@/lib/tasks/fields"
import type { TaskInfoInterface } from "@/types/task"

vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

// A formula task field's value as the list, the card and the panel read it
// (J-F WEB): its result as text, a warning chip with the server's why when it
// can't be worked out, and the lock where the server hides it (a formula that
// reads money, to anyone not an admin of the project: V-698).
afterEach(cleanup)

const field = (patch: Partial<TaskField> = {}): TaskField => ({
  id: "f", project_id: "p", name: "Spend x 2", type: "formula", options: [], on_card: true, position: 0, filter_id: "field_f", formula: "{Spend} * 2", result: "number", ...patch,
})

describe("a formula's value", () => {
  it("reads as its result", () => {
    const { container } = render(<FieldValueView field={field()} value={2500} />)
    expect(container.textContent).toBe((2500).toLocaleString())
  })

  it("can't be worked out: a warning chip with the server's why", () => {
    const { container } = render(<FieldValueView field={field()} value={{ error: "Spend was deleted" }} />)
    const chip = container.querySelector("[data-formula-error]")!
    expect(chip.getAttribute("title")).toBe("Spend was deleted")
    expect(chip.textContent).toContain("Spend was deleted")
  })

  it("compact: the chip's icon, its why in its tip and for screen readers", () => {
    const { container } = render(<FieldValueView field={field()} value={{ error: "Spend was deleted" }} compact />)
    const chip = container.querySelector("[data-formula-error]")!
    expect(chip.getAttribute("title")).toBe("Spend was deleted")
    expect(chip.querySelector(".sr-only")?.textContent).toBe("Spend was deleted")
  })

  it("hidden by the server: the lock, never a value", () => {
    const { container } = render(<FieldValueView field={field({ hidden: true })} value={2500} />)
    expect(container.querySelector("[data-field-hidden]")).toBeTruthy()
    expect(container.textContent).not.toContain("2,500")
  })
})

// CR-B55 T1: in a list's rows a formula giving a number is tabular text in its own right-aligned 72 px column, as
// money and a number are (lib/tasks/fields alignsRight); one giving text is a cell like a choice's.
describe("a formula's cell in a list's rows", () => {
  it("lines a number up on the right in its own 72 px column; text is not", () => {
    const days = field({ id: "f-days", name: "Days left" })
    const note = field({ id: "f-note", name: "Note", formula: "IF({Spend} > 0, \"spent\", \"\")", result: "text" })
    const task = { task_uuid: "1", task_name: "Print the flyers", task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "", task_fields: { "f-days": 12, "f-note": "spent" } } as unknown as TaskInfoInterface
    const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
    const { container } = render(
      <Provider store={store}>
        <GroupedTaskList tasks={[task]} options={BUILT_IN_STATUSES} grouping="status" props={[...PROJECT_PROPS, "field:f-days", "field:f-note"]} canEdit={() => true} projectId="p" fields={[days, note]} />
      </Provider>,
    )
    const [number, text] = container.querySelectorAll<HTMLElement>("[data-field-cell=formula]")
    expect(number.textContent).toBe("12")
    expect(number.className.split(" ")).toEqual(expect.arrayContaining(["w-[72px]", "shrink-0", "text-right", "tabular-nums"]))
    expect(text.textContent).toBe("spent")
    expect(text.className).not.toContain("w-[72px]")
  })
})
