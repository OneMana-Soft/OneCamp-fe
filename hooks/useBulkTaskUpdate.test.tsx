import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { act, renderHook } from "@testing-library/react"
import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

const h = vi.hoisted(() => ({
  post: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: h.post } }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
vi.mock("@/hooks/useTaskUpdate", () => ({
  useTaskUpdate: () => ({ optimisticUpdateTask: h.update, optimisticDeleteTask: h.remove, revalidateTaskKeys: h.revalidate }),
}))

const { useBulkTaskUpdate } = await import("./useBulkTaskUpdate")

pinTestClock()

const task = (id: string, extra: Partial<TaskInfoInterface> = {}) =>
  ({ task_uuid: id, task_name: id, task_status: "todo", task_priority: "low", task_label: "", task_project: { project_uuid: "p" }, ...extra }) as unknown as TaskInfoInterface

afterEach(() => {
  Object.values(h).forEach((f) => f.mockReset())
})

// PR2: a change to many tasks is one request (POST /task/bulk), not one per
// task; what the server refused is put back and read again.
describe("a bulk change", () => {
  it("sends one request for the lot, and puts back what was refused", async () => {
    h.post.mockResolvedValueOnce({ data: { data: { changed: ["a"], unchanged: [], refused: [{ task_uuid: "b", msg: "In this project you can change only the tasks assigned to you." }] } } })
    const { result } = renderHook(() => useBulkTaskUpdate("p"))
    let out: Awaited<ReturnType<typeof result.current>> | undefined
    await act(async () => {
      out = await result.current([task("a"), task("b"), task("c", { task_priority: "high" })], { field: "priority", value: "high" })
    })
    expect(h.post).toHaveBeenCalledTimes(1)
    expect(h.post).toHaveBeenCalledWith("/task/bulk", { task_uuids: ["a", "b"], op: "priority", value: "high" }, OWN_ERRORS)
    expect(h.update).toHaveBeenCalledTimes(2)
    expect(out).toMatchObject({ changed: 1, failed: 1, unchanged: 1 })
    expect(out!.done.map((t) => t.task_uuid)).toEqual(["a"])
    expect((out!.error as Error).message).toBe("In this project you can change only the tasks assigned to you.")
    expect(h.revalidate).toHaveBeenCalledWith("p")
  })

  it("names the change as the server does", async () => {
    h.post.mockResolvedValue({ data: { data: { changed: ["a"], unchanged: [], refused: [] } } })
    const { result } = renderHook(() => useBulkTaskUpdate("p"))
    await act(async () => {
      await result.current([task("a")], { field: "tags", tag: "Launch", add: true })
      await result.current([task("a", { task_label: "launch" })], { field: "tags", tag: "Launch", add: false })
      await result.current([task("a")], { field: "due", value: "2026-11-01T00:00:00.000Z" })
      await result.current([task("a")], { field: "delete" })
    })
    expect(h.post.mock.calls.map((c) => [c[1].op, c[1].value])).toEqual([
      ["tag_add", "Launch"],
      ["tag_remove", "Launch"],
      ["due", "2026-11-01T00:00:00.000Z"],
      ["delete", ""],
    ])
  })

  it("keeps a task's own request for an assignee, and fails whole when the request does", async () => {
    h.post.mockResolvedValue({ data: {} })
    const { result } = renderHook(() => useBulkTaskUpdate("p"))
    await act(async () => {
      await result.current([task("a"), task("b")], { field: "assignee", user: { user_uuid: "u" } as never })
    })
    expect(h.post.mock.calls.map((c) => c[0])).not.toContain("/task/bulk")
    expect(h.post).toHaveBeenCalledTimes(2)

    h.post.mockReset()
    h.post.mockRejectedValueOnce(new Error("offline"))
    let out: Awaited<ReturnType<typeof result.current>> | undefined
    await act(async () => {
      out = await result.current([task("a"), task("b")], { field: "priority", value: "high" })
    })
    expect(out).toMatchObject({ changed: 0, failed: 2 })
  })
})
