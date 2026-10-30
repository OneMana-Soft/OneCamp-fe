import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect, type ComponentProps } from "react"
import { Provider } from "react-redux"
import { afterEach, describe, expect, it, vi } from "vitest"

import { installPointerEvent } from "@/lib/testing/pointerEvent"

import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

// The tasks' dates (made, due) are read against a fixed today.
pinTestClock()

// F-1 #2 (FLUIDITY-LEAD, 20 Oct, beta 482460c3d): a row's hover controls (the
// select box and the priority menu) joined the tree when the row was first
// pointed at and never left, so a list scrolled under the pointer kept a menu
// in every row it passed (8,380 renders, 1,024 ms of long tasks per scroll).
// They are there only while the row is pointed at or focused, or its menu is
// open. Each mounted menu is counted.

const live = vi.hoisted(() => ({ menus: 0 }))
vi.mock("@/components/ui/dropdown-menu", async (orig) => {
  const real = await orig<typeof import("@/components/ui/dropdown-menu")>()
  return {
    ...real,
    DropdownMenu: (props: ComponentProps<typeof real.DropdownMenu>) => {
      useEffect(() => {
        live.menus++
        return () => {
          live.menus--
        }
      }, [])
      return <real.DropdownMenu {...props} />
    },
  }
})

const { default: store } = await import("@/store/store")
const { GroupedTaskList } = await import("@/components/task/GroupedTaskList")
const { BUILT_IN_STATUSES } = await import("@/lib/taskStatus")

// jsdom has no PointerEvent: a press carries its button only with the stand-in.
installPointerEvent()

afterEach(cleanup)

const task = (i: number) =>
  ({
    task_uuid: `7a5c00f2-0000-4000-8000-${String(i).padStart(12, "0")}`,
    task_name: `Task ${i}`,
    task_status: "todo",
    task_priority: "medium",
    task_label: "",
    task_due_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
  }) as unknown as TaskInfoInterface
const TASKS = Array.from({ length: 30 }, (_, i) => task(i))
const canEdit = () => true

describe("a row's hover controls", () => {
  it("never keep a menu: a list scrolled under the pointer mounts none, and a menu mounts when asked for", async () => {
    const { container } = render(
      <Provider store={store}>
        <GroupedTaskList tasks={TASKS} options={BUILT_IN_STATUSES} grouping="status" props={["priority", "due"]} canEdit={canEdit} projectId="p" />
      </Provider>,
    )
    const rows = [...container.querySelectorAll<HTMLElement>("[data-task-id]")]
    expect(rows).toHaveLength(30)
    expect(live.menus).toBe(0)
    // The rows pass under the pointer one by one.
    for (const row of rows) {
      fireEvent.pointerEnter(row)
      fireEvent.pointerLeave(row)
    }
    expect(live.menus).toBe(0)
    // The priority picker of the row it rests on opens, and goes when it closes.
    fireEvent.pointerEnter(rows[4])
    const priority = rows[4].querySelector<HTMLElement>('[aria-label="Priority of Task 4"]')!
    fireEvent.pointerDown(priority, { button: 0, pointerType: "mouse" })
    fireEvent.click(priority)
    expect(live.menus).toBe(1)
    expect(await screen.findByRole("menu")).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    await waitFor(() => expect(live.menus).toBe(0))
    // Focus goes back to the button it opened from.
    await waitFor(() => expect(document.activeElement).toBe(rows[4].querySelector('[aria-label="Priority of Task 4"]')))
  })

  it("stay out while the list scrolls under a resting pointer, and come when the pointer moves after", async () => {
    const { container } = render(
      <Provider store={store}>
        <GroupedTaskList tasks={TASKS.slice(0, 5)} options={BUILT_IN_STATUSES} grouping="status" props={["priority"]} canEdit={canEdit} projectId="p" />
      </Provider>,
    )
    const rows = [...container.querySelectorAll<HTMLElement>("[data-task-id]")]
    fireEvent.scroll(window)
    for (const row of rows) fireEvent.pointerEnter(row)
    expect(container.querySelectorAll("[role=checkbox]")).toHaveLength(0)
    // The scroll settles; the pointer moves on a row.
    await new Promise((r) => setTimeout(r, 200))
    fireEvent.pointerMove(rows[2])
    expect(container.querySelectorAll("[role=checkbox]")).toHaveLength(1)
  })

  it("stay out while a drag carries the pointer across the rows", () => {
    const { container } = render(
      <Provider store={store}>
        <GroupedTaskList tasks={TASKS.slice(0, 5)} options={BUILT_IN_STATUSES} grouping="status" props={["priority"]} canEdit={canEdit} projectId="p" />
      </Provider>,
    )
    document.documentElement.setAttribute("data-dragging", "true")
    try {
      for (const row of container.querySelectorAll<HTMLElement>("[data-task-id]")) fireEvent.pointerEnter(row)
      expect(container.querySelectorAll("[role=checkbox]")).toHaveLength(0)
    } finally {
      document.documentElement.removeAttribute("data-dragging")
    }
  })
})
