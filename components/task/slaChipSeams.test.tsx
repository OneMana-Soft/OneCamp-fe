import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// The SLA chip where it draws (linear-24 W1 FIX A, D): a restricted task (task_hidden) never draws its chip, on its own
// or in a list's row; at risk carries its own glyph, apart from on track's timer.

vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { default: SlaChip } = await import("@/components/task/SlaChip")
const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

afterEach(cleanup)

const HOUR = 3_600_000
const at = (ms: number) => new Date(Date.now() + ms).toISOString()
const breached = { state: "breached" as const, due_at: at(-2 * HOUR), risk_at: at(-8 * HOUR) }

describe("the SLA chip", () => {
  it("draws nothing for a restricted task, and draws for one the reader sees", () => {
    const { container, rerender } = render(<SlaChip sla={breached} hidden />)
    expect(container.querySelector("[data-sla]")).toBeNull()
    rerender(<SlaChip sla={breached} />)
    expect(container.querySelector("[data-sla]")).not.toBeNull()
  })

  it("at risk draws its alert glyph; on track, even close to its warning, its timer", () => {
    const { container, rerender } = render(<SlaChip sla={{ state: "at_risk", due_at: at(3 * HOUR), risk_at: at(-HOUR) }} />)
    expect(container.querySelector("[data-glyph]")?.getAttribute("data-glyph")).toBe("alert")
    rerender(<SlaChip sla={{ state: "on_track", due_at: at(5 * HOUR), risk_at: at(2 * HOUR) }} />)
    expect(container.querySelector("[data-sla]")?.getAttribute("data-sla")).toBe("medium")
    expect(container.querySelector("[data-glyph]")?.getAttribute("data-glyph")).toBe("timer")
  })
})

describe("a list's row", () => {
  const task = (id: string, name: string, hidden: boolean) =>
    ({ task_uuid: id, task_name: name, task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "", task_sla: breached, task_hidden: hidden }) as unknown as TaskInfoInterface

  it("of a restricted task draws no SLA chip; a task the reader sees draws its own", async () => {
    const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
    const { container } = render(
      <Provider store={store}>
        <GroupedTaskList tasks={[task("1", "Fix the checkout timeout", false), task("2", "A restricted task", true)]} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={() => true} projectId="p" />
      </Provider>,
    )
    await waitFor(() => expect(container.querySelectorAll("[data-sla]")).toHaveLength(1))
    const rowOf = (id: string) => container.querySelector(`[data-task-id="${id}"]`)
    expect(rowOf("1")?.querySelector("[data-sla]")).not.toBeNull()
    expect(rowOf("2")?.querySelector("[data-sla]")).toBeNull()
  })
})
