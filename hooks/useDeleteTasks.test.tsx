import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react"
import type { ReactElement } from "react"
import type { TaskInfoInterface } from "@/types/task"

const h = vi.hoisted(() => ({
  bulk: vi.fn(),
  toasts: [] as Array<{ title?: string; description?: string; variant?: string; action?: unknown }>,
}))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => h.bulk }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => (h.toasts.push(t), { id: "t", dismiss: () => {}, update: () => {} }) }))

const { useDeleteTasks } = await import("./useDeleteTasks")

const task = (id: string, name: string) => ({ task_uuid: id, task_name: name }) as TaskInfoInterface
const retro = task("t1", "Book the launch retro")
const copy = task("t2", "Write the copy")

afterEach(() => {
  cleanup()
  h.bulk.mockReset()
  h.toasts.length = 0
})

/**
 * Every delete of a task offers Undo (PTC-24): the panel deleted on one click
 * with no way back but the open task's banner, and the phone's sheet left the
 * task on its list.
 */
describe("deleting tasks", () => {
  it("says what was deleted, and Undo brings it back", async () => {
    h.bulk.mockResolvedValueOnce({ changed: 1, failed: 0, unchanged: 0, done: [retro] })
    h.bulk.mockResolvedValueOnce({ changed: 1, failed: 0, unchanged: 0, done: [retro] })
    const { result } = renderHook(() => useDeleteTasks("p1"))
    await act(() => result.current([retro]))
    expect(h.bulk).toHaveBeenLastCalledWith([retro], { field: "delete" })
    const said = h.toasts.find((t) => t.title === "Deleted “Book the launch retro”")
    expect(said).toBeTruthy()
    const undo = render(said!.action as ReactElement)
    await act(async () => {
      fireEvent.click(undo.getByText("Undo"))
    })
    // The task as it is now, in the trash (deleteTasksUndo.test runs the real restore).
    const [[back], change] = h.bulk.mock.lastCall as [TaskInfoInterface[], unknown]
    expect(change).toEqual({ field: "restore" })
    expect(back).toMatchObject({ task_uuid: "t1", task_name: "Book the launch retro" })
    expect(back.task_deleted_at).toBeTruthy()
    expect(h.toasts.at(-1)?.title).toBe("Brought back “Book the launch retro”")
  })

  it("counts many, and says which weren't deleted", async () => {
    h.bulk.mockResolvedValueOnce({ changed: 1, failed: 1, unchanged: 0, done: [copy] })
    const { result } = renderHook(() => useDeleteTasks())
    await act(() => result.current([retro, copy]))
    expect(h.toasts.find((t) => t.variant === "destructive")?.title).toBe("1 of 2 tasks wasn't deleted")
    expect(h.toasts.find((t) => t.title === "Deleted “Write the copy”")?.action).toBeTruthy()
  })

  it("offers no Undo when nothing was deleted", async () => {
    h.bulk.mockResolvedValueOnce({ changed: 0, failed: 2, unchanged: 0, done: [] })
    const { result } = renderHook(() => useDeleteTasks())
    await act(() => result.current([retro, copy]))
    expect(h.toasts).toHaveLength(1)
    expect(h.toasts[0]).toMatchObject({ variant: "destructive", title: "None of the 2 tasks were deleted" })
  })

  // Why, through the one helper (lib/utils/apiError): it said "You may no
  // longer be an admin of their project" for every refusal, a dropped
  // connection and a server fault too.
  it("says why a delete was refused, as the server or the connection says it", async () => {
    h.bulk.mockResolvedValueOnce({ changed: 0, failed: 1, unchanged: 0, done: [], error: { message: "Network Error" } })
    const { result } = renderHook(() => useDeleteTasks())
    await act(() => result.current([retro]))
    expect(h.toasts[0]).toMatchObject({ title: "The task wasn't deleted", description: "The server could not be reached. Check your connection and try again in a moment." })
  })
})
