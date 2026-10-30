import { cleanup, render } from "@testing-library/react"
import type { ComponentProps } from "react"
import { Provider } from "react-redux"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

// fluid-17 (FLUIDITY-LEAD, 20 Oct, a phone at 4x): scrolling a project's list
// on a phone drew every row again as each page came in (16,142 renders, 8 s
// of long tasks, frame p95 66.7 ms). A row draws again only when its own task
// or state changes. Each row's title is counted.

// The rows carry due dates, so today is the suite's one today (app/testClock.test.ts).
pinTestClock()

const drawn = vi.hoisted(() => ({ names: [] as string[] }))
vi.mock("@/components/task/TaskCheck", async (orig) => {
  const real = await orig<typeof import("@/components/task/TaskCheck")>()
  return {
    ...real,
    TaskTitle: (props: ComponentProps<typeof real.TaskTitle>) => {
      drawn.names.push(String(props.children))
      return <real.TaskTitle {...props} />
    },
  }
})
vi.mock("next/navigation", () => {
  const router = { replace: () => {}, push: () => {}, prefetch: () => {} }
  const params = new URLSearchParams()
  return { useRouter: () => router, useSearchParams: () => params, usePathname: () => "/app/project/p" }
})

const task = (i: number) =>
  ({
    task_uuid: `7a5c00f3-0000-4000-8000-${String(i).padStart(12, "0")}`,
    task_name: `Task ${i}`,
    task_status: "todo",
    task_priority: "medium",
    task_label: "",
    task_due_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_project: { project_uuid: "p", project_name: "Q4 launch" },
  }) as unknown as TaskInfoInterface

// The server's pages, as SWR keeps each answer: one object per page.
const pages = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => {
  const nothing = { data: undefined, isLoading: false, isError: false, mutate: () => Promise.resolve() }
  return {
    useFetch: (url: string) => (url.includes("/project/taskList/") && pages.current ? pages.current : nothing),
    useFetchOnlyOnce: () => nothing,
    useMediaFetch: () => nothing,
  }
})
vi.mock("@/hooks/usePost", () => {
  const post = { makeRequest: async () => ({}), isSubmitting: false }
  return { usePost: () => post }
})
vi.mock("@/hooks/useConfirm", () => {
  const confirm = () => {}
  return { useConfirm: () => confirm }
})

const { default: store } = await import("@/store/store")
const { ProjectTaskList } = await import("@/components/project/projectTaskList")

afterEach(() => {
  cleanup()
  drawn.names = []
  pages.current = undefined
})

const answer = (tasks: TaskInfoInterface[], pageCount: number) => ({
  data: { msg: "ok", pageCount, data: { project_uuid: "p", project_is_admin: 1, project_tasks: tasks } },
  isLoading: false,
  isError: false,
  mutate: () => Promise.resolve(),
})

describe("a project's list on a phone", () => {
  it("draws only the new rows when a page arrives", () => {
    const first = Array.from({ length: 30 }, (_, i) => task(i))
    const next = Array.from({ length: 30 }, (_, i) => task(30 + i))
    pages.current = answer(first, 2)
    const view = () => (
      <Provider store={store}>
        <ProjectTaskList projectId="p" searchQuery="" search={null} />
      </Provider>
    )
    const { rerender } = render(view())
    const shown = new Set(drawn.names)
    expect(shown.size).toBeGreaterThan(0)
    drawn.names = []
    // The next page's answer comes in.
    pages.current = answer(next, 2)
    rerender(view())
    expect(drawn.names.filter((n) => shown.has(n))).toEqual([])
  })
})
