import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

// Today's reads, stood in for: what was asked, and the answer.
const asked: string[] = []
let answer: { data?: unknown; isError?: unknown } = {}
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { data: url ? answer.data : undefined, isError: answer.isError, isLoading: !answer.data && !answer.isError, mutate }
  },
}))

const { useTask } = await import("@/hooks/useTask")
const { useProject } = await import("@/hooks/useProject")
const { useTasks, todaysRead } = await import("@/hooks/useTasks")

afterEach(() => {
  cleanup()
  asked.length = 0
  answer = {}
  mutate.mockClear()
})

// Day 0 is today's reads, on the keys the panel, the project page and the list
// ask with, so they share one request each.
describe("the work reads, on day 0", () => {
  it("read a task as the task panel does, and say how the read went", () => {
    const loading = renderHook(() => useTask("t-1"))
    expect(asked.at(-1)).toBe("/task/info/t-1")
    expect(loading.result.current.status).toBe("loading")

    answer = { isError: new Error("503") }
    const failed = renderHook(() => useTask("t-1"))
    expect(failed.result.current.status).toBe("error")
    failed.result.current.retry()
    expect(mutate).toHaveBeenCalledTimes(1)

    answer = { data: { msg: "ok", data: { task_uuid: "t-1", task_name: "Write the launch post" } } }
    const ready = renderHook(() => useTask("t-1"))
    expect(ready.result.current.status).toBe("ready")
    expect(ready.result.current.task?.task_name).toBe("Write the launch post")

    renderHook(() => useTask(null))
    expect(asked.at(-1)).toBe("")
  })

  it("read a project as its page does", () => {
    answer = { data: { msg: "ok", data: { project_uuid: "p-1", project_name: "Website" } } }
    const ready = renderHook(() => useProject("p-1"))
    expect(asked.at(-1)).toBe("/project/info/p-1")
    expect(ready.result.current.project?.project_name).toBe("Website")
  })

  it("list a project's tasks a page at a time, the cursor being the page's number", () => {
    const spec = { scope: { kind: "project" as const, id: "p-1" } }
    answer = { data: { msg: "ok", data: { project_task_count: 3, project_tasks: [{ task_uuid: "a" }, { task_uuid: "b" }] } } }
    const first = renderHook(() => useTasks(spec, { size: 2 }))
    expect(asked.at(-1)).toBe("/project/taskList/p-1?pageSize=2&pageIndex=0")
    expect(first.result.current.tasks.map((t) => t.task_uuid)).toEqual(["a", "b"])
    expect(first.result.current.next).toBe("1")
    const last = renderHook(() => useTasks(spec, { size: 2, after: "1" }))
    expect(asked.at(-1)).toBe("/project/taskList/p-1?pageSize=2&pageIndex=1")
    expect(last.result.current.next).toBeUndefined()
  })

  it("say a spec today's reads can't answer isn't built, without asking", () => {
    for (const spec of [
      { scope: { kind: "mine" as const } },
      { scope: { kind: "project" as const, id: "p-1" }, search: "launch" },
      { scope: { kind: "project" as const, id: "p-1" }, sorts: [{ field: "due" }] },
      { scope: { kind: "project" as const, id: "p-1" }, filter: { field: "status", operator: "is" as const, values: [{ text: "done" }] } },
    ]) {
      expect(todaysRead(spec, { size: 50 })).toBe("")
      const got = renderHook(() => useTasks(spec, { size: 50 }))
      expect(got.result.current.status).toBe("unavailable")
    }
    expect(asked.every((url) => url === "")).toBe(true)
  })
})
