import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react"
import type { ReactElement } from "react"
import { PostEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"

// useDeleteTasks.test mocks the bulk hook; this one runs the real one, with
// the requests it sends recorded, so a delete and its Undo meet the rules
// lib/bulkTasks applies to each task (a restore skips a task not in the trash).
const h = vi.hoisted(() => ({
  posts: [] as string[],
  toasts: [] as Array<{ title?: string; description?: string; variant?: string; action?: unknown }>,
  // The server's refusal, when a test wants one.
  refusal: null as unknown,
}))
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    post: async (url: string) => {
      h.posts.push(url)
      if (h.refusal) throw h.refusal
      return { data: { msg: "ok" } }
    },
  },
  OWN_ERRORS: {},
}))
vi.mock("@/hooks/useTaskUpdate", () => ({
  useTaskUpdate: () => ({ optimisticUpdateTask: () => {}, optimisticDeleteTask: () => {}, revalidateTaskKeys: () => {} }),
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: async () => undefined }))
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: { title?: string }) => (h.toasts.push(t), { id: "t", dismiss: () => {}, update: () => {} }),
}))

const { useDeleteTasks } = await import("./useDeleteTasks")

// A task as every list holds it: live, so its deletion time is the zero time.
const retro = {
  task_uuid: "t1",
  task_name: "Book the launch retro",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_project: { project_uuid: "p1" },
} as TaskInfoInterface

afterEach(() => {
  cleanup()
  h.posts.length = 0
  h.toasts.length = 0
  h.refusal = null
})

describe("a delete the server refuses", () => {
  it("says the server's reason", async () => {
    h.refusal = { response: { status: 403, data: { msg: "Only the project's admins can delete its tasks." } } }
    const { result } = renderHook(() => useDeleteTasks("p1"))
    await act(() => result.current([retro]))
    expect(h.toasts).toHaveLength(1)
    expect(h.toasts[0]).toMatchObject({ variant: "destructive", title: "The task wasn't deleted", description: "Only the project's admins can delete its tasks." })
  })
})

describe("Undo after deleting a task", () => {
  it("sends the task back from the trash, and says so", async () => {
    const { result } = renderHook(() => useDeleteTasks("p1"))
    await act(() => result.current([retro]))
    expect(h.posts).toEqual([PostEndpointUrl.ArchiveTask])

    const said = h.toasts.find((t) => t.title === "Deleted “Book the launch retro”")
    expect(said?.action).toBeTruthy()
    const undo = render(said!.action as ReactElement)
    await act(async () => {
      fireEvent.click(undo.getByText("Undo"))
    })
    // The task as it was before the delete reads as live, and a restore of a
    // live task sent nothing: Undo did nothing and said nothing.
    expect(h.posts).toEqual([PostEndpointUrl.ArchiveTask, PostEndpointUrl.UnArchiveTask])
    expect(h.toasts.at(-1)?.title).toBe("Brought back “Book the launch retro”")
  })
})
