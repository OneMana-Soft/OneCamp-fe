import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// The task finder (calendar B1, gcal-new-task-blocks): your tasks to pick one
// from, as My Tasks reads them. With nothing typed, the open ones due by a
// day, soonest first; typed, any of yours by its name. Done ones never show.
// It is the combobox's menu (PickTask), opened by the control it wraps.

const urls: string[] = []
let answer: (url: string) => unknown[] = () => []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    urls.push(url)
    return { data: url ? { msg: "", data: { user_tasks: answer(url) } } : undefined, isLoading: false }
  },
}))

import { PickTask } from "./lazyTaskFinder"
import { taskFinderQuery } from "./taskFinder"

pinTestClock()

const BRIEF = {
  task_uuid: "t-brief",
  task_name: "Write the launch brief",
  task_status: "inProgress",
  task_due_date: new Date(2026, 9, 16, 12).toISOString(),
  task_project: { project_uuid: "p-launch", project_name: "Launch" },
}
const DECK = {
  task_uuid: "t-deck",
  task_name: "Pitch deck",
  task_status: "todo",
  task_due_date: new Date(2026, 9, 20, 12).toISOString(),
  task_project: { project_uuid: "p-sales", project_name: "Sales" },
}
const SHIPPED = { ...DECK, task_uuid: "t-done", task_name: "Ship the beta", task_status: "done" }

afterEach(() => {
  cleanup()
  urls.length = 0
  answer = () => []
})

const DUE_BY = new Date(2026, 9, 29)

/** The finder open, as a caller that keeps its pickers' state opens it. */
function openFinder(onPick = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <PickTask dueBy={DUE_BY} onPick={onPick} open onOpenChange={onOpenChange}>
      <button type="button">Time for a task</button>
    </PickTask>,
  )
  return { onPick, onOpenChange }
}

describe("the task finder", () => {
  it("asks for your open tasks due by the day, soonest first, and by name once you type", () => {
    const due = taskFinderQuery("", DUE_BY)
    expect(due).toMatch(/^\/user\/assignedTaskList\?/)
    expect(new URLSearchParams(due.split("?")[1]).get("dueBy")).toBe(DUE_BY.toISOString())
    expect(JSON.parse(new URLSearchParams(due.split("?")[1]).get("sorting") ?? "[]")).toEqual([{ id: "task_due_date", desc: false }])
    const named = new URLSearchParams(taskFinderQuery("  launch brief ", DUE_BY).split("?")[1])
    expect(named.get("taskSearchString")).toBe("launch brief")
    expect(named.get("dueBy")).toBeNull()
  })

  it("opens from the control it wraps, which keeps its own name", async () => {
    answer = () => [BRIEF]
    render(
      <PickTask dueBy={DUE_BY} onPick={vi.fn()}>
        <button type="button">Time for a task</button>
      </PickTask>,
    )
    expect(screen.queryByRole("option")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Time for a task" }))
    expect((await screen.findAllByRole("option")).map((r) => r.textContent)).toEqual([expect.stringMatching(/Write the launch brief/)])
  })

  it("lists what's due with its project and day, and never a finished task", async () => {
    answer = () => [BRIEF, SHIPPED, DECK]
    openFinder()
    const rows = await screen.findAllByRole("option")
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/Write the launch brief.*Tomorrow.*Launch/), expect.stringMatching(/Pitch deck.*20 Oct.*Sales/)])
    expect(screen.queryByText("Ship the beta")).toBeNull()
  })

  it("finds any of your tasks by its name as you type", async () => {
    answer = (url) => (url.includes("taskSearchString=deck") ? [DECK] : [BRIEF])
    openFinder()
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "deck" } })
    await waitFor(() => expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual([expect.stringMatching(/Pitch deck/)]), { timeout: 3000 })
  })

  it("says how to find one when nothing is due", async () => {
    openFinder()
    expect(await screen.findByText(/Nothing of yours is due by 29 Oct\. Type a task's name to find it\./)).toBeTruthy()
  })

  it("gives back the task picked, and closes", async () => {
    answer = () => [BRIEF, DECK]
    const { onPick, onOpenChange } = openFinder()
    fireEvent.click(await screen.findByRole("option", { name: /Pitch deck/ }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ task_uuid: "t-deck", task_name: "Pitch deck" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
