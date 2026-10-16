import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { TaskActivityInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// PROJ-BUG-8: a task's history came oldest first and Dgraph cut it at 1,000
// lines, so a long-lived task lost its newest changes. The details now carry
// the newest lines and say when older ones exist; the panel asks for those 50
// at a time, before the oldest line it shows.

const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: h.get } }))

const { useEarlierHistory } = await import("@/hooks/useEarlierHistory")
const { EarlierHistoryButton } = await import("@/components/task/taskActivitySection")

afterEach(() => {
  cleanup()
  h.get.mockReset()
})

const line = (n: number): TaskActivityInterface =>
  ({ activity_uuid: `a-${n}`, activity_type: "status", activity_time: new Date(2026, 9, 1, 9, n).toISOString(), activity_prev_state: "", activity_next_state: "" }) as TaskActivityInterface

function History({ task, newest, hasMore }: { task: string; newest: TaskActivityInterface[]; hasMore?: boolean }) {
  const history = useEarlierHistory(task, newest, hasMore)
  return (
    <div>
      <EarlierHistoryButton earlier={history} />
      <ol>
        {history.activities?.map((a) => (
          <li key={a.activity_uuid}>{a.activity_uuid}</li>
        ))}
      </ol>
    </div>
  )
}
const shown = () => screen.queryAllByRole("listitem").map((li) => li.textContent)

describe("a task's earlier history", () => {
  it("offers nothing when the details hold every line", () => {
    render(<History task="t" newest={[line(5), line(6)]} hasMore={false} />)
    expect(screen.queryByRole("button", { name: "Show earlier history" })).toBeNull()
  })

  it("asks for the 50 lines before the oldest shown, puts them above, and stops when there are no more", async () => {
    h.get.mockResolvedValueOnce({ data: { data: { task_activities: [line(3), line(4)], task_activity_has_more: false } } })
    render(<History task="t" newest={[line(5), line(6)]} hasMore />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Show earlier history" })))
    expect(h.get).toHaveBeenCalledWith("/task/getTaskActivityList/t?before=a-5&first=50")
    expect(shown()).toEqual(["a-3", "a-4", "a-5", "a-6"])
    expect(screen.queryByRole("button", { name: "Show earlier history" })).toBeNull()
  })

  it("goes on from the oldest it has, and starts again for another task", async () => {
    h.get.mockResolvedValueOnce({ data: { data: { task_activities: [line(3), line(4)], task_activity_has_more: true } } })
    h.get.mockResolvedValueOnce({ data: { data: { task_activities: [line(1), line(2)], task_activity_has_more: false } } })
    const view = render(<History task="t" newest={[line(5)]} hasMore />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Show earlier history" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Show earlier history" })))
    expect(h.get).toHaveBeenLastCalledWith("/task/getTaskActivityList/t?before=a-3&first=50")
    expect(shown()).toEqual(["a-1", "a-2", "a-3", "a-4", "a-5"])
    view.rerender(<History task="u" newest={[line(9)]} hasMore={false} />)
    expect(shown()).toEqual(["a-9"])
  })
})
