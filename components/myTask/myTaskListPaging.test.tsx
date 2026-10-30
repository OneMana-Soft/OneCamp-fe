import { useLayoutEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

import { pinTestClock } from "@/lib/testing/testClock"
import type { sortInterface } from "@/store/slice/taskFilterSlice"

// My Tasks on a phone reads its tasks a page at a time. Once the last page was
// in it asked for the one past it, as a project's list did: the same paging
// rule, written in each.

const nav = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
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
const { updateMyTaskSortingAndFiltering, clearMyTaskSortingFilteringAndTask } = await import("@/store/slice/taskFilterSlice")
const { MyTaskList } = await import("@/components/myTask/myTaskList")
const { PHONE_PAGE_SIZE } = await import("@/lib/tasks/grouping")

// The tasks are dated: the tests run on the suite's one day.
pinTestClock()

afterEach(() => {
  cleanup()
  shown.length = 0
  asked.length = 0
  answers.clear()
  nav.replace.mockClear()
  window.history.replaceState(null, "", "/")
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

  // fluid-17: the page went into the address through the router, which
  // fetched the route again for every page a scroll loaded.
  it("keeps the page it has read to in the address, without a navigation", () => {
    window.history.replaceState(null, "", "/app/myTask?view=list")
    serve(Array.from({ length: PHONE_PAGE_SIZE + 20 }, (_, i) => task(i)))
    readToTheEnd()
    expect(nav.replace).not.toHaveBeenCalled()
    const at = new URL(window.location.href)
    expect([at.pathname, at.searchParams.get("view"), at.searchParams.get("page")]).toEqual(["/app/myTask", "list", "1"])
  })

  it("asks for nothing more when the first page is the whole list", () => {
    serve(Array.from({ length: 7 }, (_, i) => task(i)))
    readToTheEnd()
    expect(pagesAsked()).toEqual([0])
    expect(shown.at(-1)).toMatchObject({ count: 7, hasMore: false })
  })
})

// R2b's design review, 23 Oct: with nothing assigned, a phone said "You're all caught up"
// under "2 to approve", where a computer says what is true whatever else waits.
describe("My Tasks on a phone with nothing assigned", () => {
  it("says so in the computer's words, never that you're all caught up", () => {
    serve([])
    render(
      <Provider store={store}>
        <MyTaskList searchQuery="" />
      </Provider>,
    )
    expect(screen.getByText("Nothing assigned to you")).toBeInTheDocument()
    expect(screen.getByText("Tasks you're given, or make for yourself, land here.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New task" })).toBeInTheDocument()
    expect(screen.queryByText(/caught up/)).toBeNull()
  })
})

// A search's read left the list's sort and filters out, as a project's list
// did: sorted and filtered in the phone's sheet, then searched, My Tasks came
// back in the server's order with every task. Its first read did too.
describe("My Tasks on a phone, sorted and filtered", () => {
  const sort: sortInterface[] = [{ id: "task_due_date", desc: true }]
  const filters = [{ id: "task_status", value: ["todo", "inProgress"] }]
  const asks = () =>
    asked.map((u) => {
      const q = new URL(u, "http://app").searchParams
      return { sorting: q.get("sorting"), filters: q.get("filters"), search: q.get("taskSearchString"), page: q.get("pageIndex") }
    })
  const list = (searchQuery: string) => (
    <Provider store={store}>
      <MyTaskList searchQuery={searchQuery} />
    </Provider>
  )

  afterEach(() => {
    store.dispatch(clearMyTaskSortingFilteringAndTask())
  })

  it("asks for its first page sorted and filtered", () => {
    serve(Array.from({ length: 7 }, (_, i) => task(i)))
    store.dispatch(updateMyTaskSortingAndFiltering({ sort, filters }))
    render(list(""))
    expect(asks()).toEqual([{ sorting: JSON.stringify(sort), filters: JSON.stringify(filters), search: null, page: "0" }])
  })

  it("asks for a search's tasks sorted and filtered", () => {
    serve(Array.from({ length: 7 }, (_, i) => task(i)))
    store.dispatch(updateMyTaskSortingAndFiltering({ sort, filters }))
    const view = render(list(""))
    view.rerender(list("venue"))
    expect(asks().at(-1)).toEqual({ sorting: JSON.stringify(sort), filters: JSON.stringify(filters), search: "venue", page: "0" })
  })
})
