import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { SWRConfig, useSWRConfig } from "swr"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { timelineKey } from "@/lib/timelineKey"
import { GetEndpointUrl } from "@/services/endPoints"

afterEach(cleanup)

type Task = { task_uuid: string; task_name: string; task_due_date?: string; task_priority?: string }
const task = (id: string, more: Partial<Task> = {}): Task => ({ task_uuid: id, task_name: id, ...more })

/** The hook over a cache of its own, seeded with each key's response. */
async function withLists(seed: Record<string, object>) {
  const cache = new Map()
  const wrapper = ({ children }: { children: ReactNode }) => <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
  const { result } = renderHook(() => ({ ...useTaskUpdate(), swr: useSWRConfig() }), { wrapper })
  await act(async () => {
    for (const [key, data] of Object.entries(seed)) await result.current.swr.mutate(key, { data }, { revalidate: false })
  })
  const read = (key: string) => (cache.get(key) as { data?: { data: Record<string, Task[]> } } | undefined)?.data?.data
  return { hook: result, read }
}

describe("optimisticUpdateTasks", () => {
  const board = `${GetEndpointUrl.GetProjectTaskListForKanban}/p1`
  const due = "2026-10-20T17:00:00Z"

  it("changes each of the project's lists once for all the tasks, copying only the tasks patched", async () => {
    const [a, b, c] = [task("a"), task("b"), task("c")]
    const { hook, read } = await withLists({
      [timelineKey("p1")]: { tasks: [a, b, c] },
      [board]: { project_tasks_todo: [a, b], project_tasks_done: [c] },
      [timelineKey("p2")]: { tasks: [task("a")] },
    })
    act(() =>
      hook.current.optimisticUpdateTasks(
        [
          { task_uuid: "a", task_due_date: due },
          { task_uuid: "c", task_due_date: due },
        ],
        "p1",
      ),
    )
    await waitFor(() => expect(read(timelineKey("p1"))?.tasks.map((t) => t.task_due_date)).toEqual([due, undefined, due]))
    expect(read(timelineKey("p1"))?.tasks[1]).toBe(b)
    expect(read(board)?.project_tasks_todo[0].task_due_date).toBe(due)
    expect(read(board)?.project_tasks_done[0].task_due_date).toBe(due)
    expect(read(board)?.project_tasks_todo[1]).toBe(b)
    expect(read(timelineKey("p2"))?.tasks[0].task_due_date).toBeUndefined()
  })

  it("drops a patched task from a filtered list it no longer matches", async () => {
    const filters = encodeURIComponent(JSON.stringify([{ id: "task_priority", value: ["high"] }]))
    const list = `${GetEndpointUrl.GetProjectTaskList}/p1?filters=${filters}`
    const { hook, read } = await withLists({ [list]: { project_tasks: [task("a", { task_priority: "high" }), task("b", { task_priority: "high" })] } })
    act(() => hook.current.optimisticUpdateTasks([{ task_uuid: "a", task_priority: "low" }], "p1"))
    await waitFor(() => expect(read(list)?.project_tasks.map((t) => t.task_uuid)).toEqual(["b"]))
  })

  it("is what a single task's change of fields goes through", async () => {
    const b = task("b")
    const { hook, read } = await withLists({ [board]: { project_tasks_todo: [task("a"), b] } })
    act(() => hook.current.optimisticUpdateTask({ task_uuid: "a", task_name: "Renamed" }, "p1"))
    await waitFor(() => expect(read(board)?.project_tasks_todo[0].task_name).toBe("Renamed"))
    expect(read(board)?.project_tasks_todo[1]).toBe(b)
  })
})
