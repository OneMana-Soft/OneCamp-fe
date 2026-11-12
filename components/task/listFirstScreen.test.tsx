import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// A long list's first screen (H3-e, PLAN's first-screen plan): the window
// (components/task/listWindow) is a chunk of its own, fetched as the list
// passes 200 tasks, so a cold open, or "Show N more" on a 640-row group, drew
// every row shown before it arrived: 640 rows mounted in one commit for a
// list whose screen holds about twenty. The list draws a screen of rows until
// the window plans, and pads for the rest so the page scrolls the same.
// A row's cells are counted by its title.
const drawn = vi.hoisted(() => {
  let arrive = () => {}
  const arrived = new Promise<void>((r) => (arrive = r))
  return { titles: 0, arrive: () => arrive(), arrived }
})
vi.mock("@/components/task/listWindow", async (orig) => {
  await drawn.arrived
  return orig()
})
vi.mock("@/components/task/TaskCheck", async (orig) => {
  const real = await orig<typeof import("@/components/task/TaskCheck")>()
  return {
    ...real,
    TaskTitle: (props: React.ComponentProps<typeof real.TaskTitle>) => {
      drawn.titles++
      return <real.TaskTitle {...props} />
    },
  }
})
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t = (i: number, status = "todo") => ({ task_uuid: `t${i}`, task_name: `Task ${i}`, task_status: status, task_priority: "medium", task_label: "", task_due_date: "" }) as TaskInfoInterface
const OPEN = ["backlog", "todo", "inProgress", "inReview"]

function renderList(tasks: TaskInfoInterface[]) {
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
  return render(
    <Provider store={store}>
      <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={() => true} projectId="p" />
    </Provider>,
  )
}
const rows = (c: HTMLElement) => c.querySelectorAll("[data-grouped-list] [data-task-id]").length

// In this order: the window's chunk arrives in the last case.
describe("a long list before its window arrives", () => {
  it("draws a screen of rows when a project opens with more than 200 rows shown", () => {
    drawn.titles = 0
    // Four open groups of 160: 60 shown in each, 240 in all.
    const { container } = renderList(Array.from({ length: 640 }, (_, i) => t(i, OPEN[i % 4])))
    expect(drawn.titles).toBeLessThanOrEqual(60)
    expect(rows(container)).toBeLessThanOrEqual(60)
    // The groups past the screen keep their headers, and the page its height: each row not drawn is padded for (40 px).
    expect(container.querySelectorAll("[data-group-header]")).toHaveLength(OPEN.length)
    const padded = Array.from(container.querySelectorAll<HTMLElement>('[role="list"]'), (l) => parseFloat(l.style.paddingBottom) || 0)
    expect(padded.reduce((a, b) => a + b, 0)).toBe((240 - rows(container)) * 40)
  })

  it("draws a screen of rows for Show N more on a 640-row group", () => {
    const { container } = renderList(Array.from({ length: 640 }, (_, i) => t(i)))
    expect(rows(container)).toBe(60)
    drawn.titles = 0
    fireEvent.click(screen.getByRole("button", { name: "Show 580 more" }))
    expect(drawn.titles).toBeLessThanOrEqual(60)
    expect(rows(container)).toBeLessThanOrEqual(60)
  })

  it("hands the list to the window once it arrives", async () => {
    const { container } = renderList(Array.from({ length: 640 }, (_, i) => t(i)))
    fireEvent.click(screen.getByRole("button", { name: "Show 580 more" }))
    await act(async () => drawn.arrive())
    // The window plans the list: its rows carry their place among the group's 640.
    await waitFor(() => expect(container.querySelector('[role="list"][data-rows="640"]')).toBeTruthy())
    expect(rows(container)).toBeLessThanOrEqual(60)
  })

  it("draws a screen of rows for Show N more once the window is in, before it plans", async () => {
    const { container } = renderList(Array.from({ length: 640 }, (_, i) => t(i)))
    // In, and not windowing: 60 rows shown are too few.
    expect(rows(container)).toBe(60)
    drawn.titles = 0
    fireEvent.click(screen.getByRole("button", { name: "Show 580 more" }))
    await waitFor(() => expect(container.querySelector('[role="list"][data-rows="640"]')).toBeTruthy())
    expect(drawn.titles).toBeLessThanOrEqual(60)
  })
})
