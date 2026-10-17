import { useLayoutEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

import { pinTestClock } from "@/lib/testing/testClock"

// A project's list on a phone reads its tasks a page at a time, and a group
// says "N+" while pages are still to come and its count once they are all in
// (PROJ-BUG-2's stop-gap). It said an exact count for a render after a scroll
// wanted the next page (the page number moves before its request starts) and
// for a render after that page's answer came (its tasks reach the list in an
// effect after it): "To do 47" while 70 more were coming. Once the last page
// was in, it asked for the one past it.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
}))

type Row = { kind?: "group"; label?: string; count?: string; task_uuid?: string }
/** What the list showed, after each commit: its rows, and whether it would ask for more. */
const shown: { rows: Row[]; hasMore: boolean; onLoadMore: () => void }[] = []
vi.mock("@/components/list/virtualInfiniteScroll", () => ({
  VirtualInfiniteScroll: (p: { items: Row[]; hasMore?: boolean; onLoadMore: () => void }) => {
    useLayoutEffect(() => {
      shown.push({ rows: p.items, hasMore: !!p.hasMore, onLoadMore: p.onLoadMore })
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
    if (!url.startsWith("/project/taskList/")) return { data: undefined, isLoading: false, isError: false, mutate: vi.fn() }
    if (!answers.has(url)) {
      asked.push(url)
      answers.set(url, { data: list(new URL(url, "http://app")), isLoading: false, isError: false, mutate: vi.fn() })
    }
    return answers.get(url)
  },
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

const { default: store } = await import("@/store/store")
const { ProjectTaskList } = await import("@/components/project/projectTaskList")
const { PHONE_PAGE_SIZE } = await import("@/lib/tasks/grouping")

// The tasks are dated: the tests run on the suite's one day.
pinTestClock()

afterEach(() => {
  cleanup()
  shown.length = 0
  asked.length = 0
  answers.clear()
})

const task = (project: string, i: number, status: string) => ({
  task_uuid: `${project}-task-${i + 1}`,
  task_name: `Task ${i + 1}`,
  task_status: status,
  task_priority: "medium",
  task_label: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_project: { project_uuid: project, project_name: "Billing" },
})

/** The server's paging: pageCount is the pages there are (the count over the page size, rounded up), and an empty page leaves its list out. */
function serve(project: string, tasks: ReturnType<typeof task>[]) {
  list = (url) => {
    const size = Number(url.searchParams.get("pageSize"))
    const index = Number(url.searchParams.get("pageIndex"))
    const page = tasks.slice(index * size, index * size + size)
    return {
      msg: "ok",
      data: { project_uuid: project, project_name: "Billing", project_is_admin: 1, project_task_count: tasks.length, ...(page.length ? { project_tasks: page } : {}) },
      pageCount: Math.ceil(tasks.length / size),
    }
  }
}

/** The list read to its end, as a reader scrolling to its foot: more is asked for while it says there is more. */
function readToTheEnd(project: string) {
  render(
    <Provider store={store}>
      <ProjectTaskList projectId={project} searchQuery="" search={null} />
    </Provider>,
  )
  for (let i = 0; i < 6 && shown.at(-1)?.hasMore; i++) act(() => shown.at(-1)!.onLoadMore())
}

const heads = (rows: Row[]) => rows.filter((r) => r.kind === "group").map((r) => `${r.label} ${r.count}`)
const tasksIn = (rows: Row[]) => rows.filter((r) => r.kind !== "group").length

describe("a project's list on a phone, a page at a time", () => {
  it("says N+ from the moment the next page is wanted until its tasks are in the list, then each group's count", () => {
    // Two pages: three in progress on the first, the rest to do.
    const tasks = Array.from({ length: PHONE_PAGE_SIZE + 20 }, (_, i) => task("p1", i, i < 3 ? "inProgress" : "todo"))
    serve("p1", tasks)
    readToTheEnd("p1")
    expect(asked.length).toBeGreaterThan(1)
    for (const s of shown) {
      if (tasksIn(s.rows) < tasks.length) {
        expect(heads(s.rows).every((h) => h.endsWith("+")), `${tasksIn(s.rows)} of ${tasks.length} tasks in: ${heads(s.rows).join(", ")}`).toBe(true)
      }
    }
    expect(heads(shown.at(-1)!.rows).sort()).toEqual(["In progress 3", `To do ${tasks.length - 3}`])
  })

  it("asks for no page past the last, and for nothing more once that one is in", () => {
    const tasks = Array.from({ length: PHONE_PAGE_SIZE + 20 }, (_, i) => task("p2", i, "todo"))
    serve("p2", tasks)
    readToTheEnd("p2")
    const pages = Math.ceil(tasks.length / PHONE_PAGE_SIZE)
    const indexes = asked.map((u) => Number(new URL(u, "http://app").searchParams.get("pageIndex")))
    expect(indexes).toEqual(Array.from({ length: pages }, (_, i) => i))
    expect(shown.at(-1)!.hasMore).toBe(false)
  })

  it("asks for nothing more when the first page is the whole list", () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task("p3", i, i < 2 ? "inProgress" : "todo"))
    serve("p3", tasks)
    readToTheEnd("p3")
    expect(asked.map((u) => new URL(u, "http://app").searchParams.get("pageIndex"))).toEqual(["0"])
    expect(heads(shown.at(-1)!.rows).sort()).toEqual(["In progress 2", "To do 5"])
    expect(shown.at(-1)!.hasMore).toBe(false)
  })
})
