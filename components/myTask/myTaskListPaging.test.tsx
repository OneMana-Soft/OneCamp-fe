import { useLayoutEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

import { pinTestClock } from "@/lib/testing/testClock"

// My Tasks on a phone reads its tasks a page at a time. Once the last page was
// in it asked for the one past it, as a project's list did: the same paging
// rule, written in each.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/myTask",
}))

/** Whether the list would ask for more, after each commit, and how it asks. */
const shown: { count: number; hasMore: boolean; onLoadMore: () => void }[] = []
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: (p: { items: unknown[]; hasMore?: boolean; onLoadMore: () => void }) => {
    useLayoutEffect(() => {
      shown.push({ count: p.items.length, hasMore: !!p.hasMore, onLoadMore: p.onLoadMore })
    })
    return null
  },
}))

/** Every list read asked for, and its answer: one object per address, as SWR keeps it. */
const asked: string[] = []
const answers = new Map<string, unknown>()
let list: (url: URL) => unknown = () => undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (!url.startsWith("/user/assignedTaskList?")) return { data: undefined, isLoading: false, isError: false, mutate: vi.fn() }
    if (!answers.has(url)) {
      asked.push(url)
      answers.set(url, { data: list(new URL(url, "http://app")), isLoading: false, isError: false, mutate: vi.fn() })
    }
    return answers.get(url)
  },
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))

const { default: store } = await import("@/store/store")
const { MyTaskList } = await import("@/components/myTask/myTaskList")
const { PHONE_PAGE_SIZE } = await import("@/lib/tasks/grouping")

// The tasks are dated: the tests run on the suite's one day.
pinTestClock()

afterEach(() => {
  cleanup()
  shown.length = 0
  asked.length = 0
  answers.clear()
})

const task = (i: number) => ({
  task_uuid: `mine-task-${i + 1}`,
  task_name: `Task ${i + 1}`,
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_project: { project_uuid: "p", project_name: "Billing", project_is_admin: 1 },
})

/** The server's paging: pageCount is the pages there are, and an empty page leaves its list out. */
function serve(tasks: ReturnType<typeof task>[]) {
  list = (url) => {
    const size = Number(url.searchParams.get("pageSize"))
    const index = Number(url.searchParams.get("pageIndex"))
    const page = tasks.slice(index * size, index * size + size)
    return { msg: "ok", data: page.length ? { user_tasks: page } : {}, pageCount: Math.ceil(tasks.length / size) }
  }
}

/** The list read to its end, as a reader scrolling to its foot: more is asked for while it says there is more. */
function readToTheEnd() {
  render(
    <Provider store={store}>
      <MyTaskList searchQuery="" />
    </Provider>,
  )
  for (let i = 0; i < 6 && shown.at(-1)?.hasMore; i++) act(() => shown.at(-1)!.onLoadMore())
}

const pagesAsked = () => asked.map((u) => Number(new URL(u, "http://app").searchParams.get("pageIndex")))

describe("My Tasks on a phone, a page at a time", () => {
  it("asks for no page past the last, and for nothing more once that one is in", () => {
    const tasks = Array.from({ length: PHONE_PAGE_SIZE + 20 }, (_, i) => task(i))
    serve(tasks)
    readToTheEnd()
    expect(pagesAsked()).toEqual([0, 1])
    expect(shown.at(-1)).toMatchObject({ count: tasks.length, hasMore: false })
  })

  it("asks for nothing more when the first page is the whole list", () => {
    serve(Array.from({ length: 7 }, (_, i) => task(i)))
    readToTheEnd()
    expect(pagesAsked()).toEqual([0])
    expect(shown.at(-1)).toMatchObject({ count: 7, hasMore: false })
  })
})
