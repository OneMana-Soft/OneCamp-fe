import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

const get = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { get: (...args: unknown[]) => get(...args) } }))

import { useAssignedTasks } from "./useAssignedTasks"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

function Tasks() {
  const { data } = useAssignedTasks("startDate=2026-09-28T00:00:00.000Z&endDate=2026-11-08T23:59:59.999Z", { suppressErrorToast: true })
  return <p data-count={data?.data.user_tasks.length ?? -1} />
}

afterEach(() => {
  cleanup()
  get.mockReset()
})

// FE-F-1: the calendar asked for 100 of the month's tasks and showed them as all of it.
describe("the tasks assigned to you in a range", () => {
  it("are read page by page, every one, by id so none falls between pages", async () => {
    const all = Array.from({ length: 250 }, (_, i) => ({ task_uuid: `t${i}`, task_name: `Task ${i}` }))
    get.mockImplementation(async (url: string) => {
      const q = new URL(url, "http://x").searchParams
      const [i, n] = [Number(q.get("pageIndex")), Number(q.get("pageSize"))]
      return { data: { msg: "", data: { user_tasks: all.slice(i * n, (i + 1) * n) } } }
    })
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Tasks />
      </SWRConfig>,
    )
    await waitFor(() => expect(document.querySelector("p")!.getAttribute("data-count")).toBe("250"))
    const asked = get.mock.calls.map(([url]) => new URL(url as string, "http://x"))
    expect(asked.map((u) => u.pathname)).toEqual(["/user/assignedTaskList", "/user/assignedTaskList", "/user/assignedTaskList"])
    expect(asked.map((u) => u.searchParams.get("pageIndex"))).toEqual(["0", "1", "2"])
    for (const u of asked) {
      expect(u.searchParams.get("pageSize")).toBe("100")
      expect(u.searchParams.get("startDate")).toBe("2026-09-28T00:00:00.000Z")
      expect(JSON.parse(u.searchParams.get("sorting")!)).toEqual([{ id: "task_uuid", desc: false }])
    }
    expect(get.mock.calls[0][1]).toEqual({ suppressErrorToast: true })
  })
})
