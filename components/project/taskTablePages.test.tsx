import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ReactElement } from "react"

import type { TaskInfoInterface } from "@/types/task"

/**
 * A task table reads its tasks a page at a time, and "Show more" at its foot
 * brings the next page, up to the last. It used to ask for its one page
 * again, 500 longer each time, and the server hands out at most 5,000 at once
 * (helpers.ListPageMax): a list longer than that stopped at its first 5,000,
 * under a "Show more" that brought nothing however often it was pressed.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

/** What the list drew, commit by commit: whether it counted its groups as partial, and how many tasks it held. */
const drawn: { loading: boolean; partial: boolean; count: number }[] = []
vi.mock("@/components/task/GroupedTaskList", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/task/GroupedTaskList")>()
  const { useLayoutEffect } = await import("react")
  return {
    ...real,
    GroupedTaskList: (p: Parameters<typeof real.GroupedTaskList>[0]) => {
      useLayoutEffect(() => {
        drawn.push({ loading: !!p.loading, partial: !!p.partial, count: p.tasks.length })
      })
      return <real.GroupedTaskList {...p} />
    },
  }
})

/** Every task list read asked for, and its answer: one object per address, as SWR keeps it. */
const asked: string[] = []
const answers = new Map<string, unknown>()
let serve: (url: URL) => unknown = () => undefined
vi.mock("@/hooks/useFetch", () => {
  const nothing = { data: undefined, isLoading: false, isError: undefined, mutate: async () => undefined }
  return {
    useFetch: (url: string) => {
      if (!url.startsWith("/project/taskList/") && !url.startsWith("/user/assignedTaskList?")) return nothing
      if (!answers.has(url)) {
        asked.push(url)
        answers.set(url, { data: serve(new URL(url, "http://app")), isLoading: false, isError: undefined, mutate: async () => undefined })
      }
      return answers.get(url)
    },
    useFetchOnlyOnce: () => nothing,
    useMediaFetch: () => nothing,
  }
})

const { default: store } = await import("@/store/store")
const { clearTaskListVisibleInfo } = await import("@/store/slice/taskInfoSlice")
const { ProjectTaskTable } = await import("@/components/project/projectTaskTable")
const { MyTaskTable } = await import("@/components/myTask/myTaskTable")
const { TASK_PAGE, joinPages } = await import("@/components/task/useTaskPages")

afterEach(() => {
  cleanup()
  asked.length = 0
  answers.clear()
  drawn.length = 0
  store.dispatch(clearTaskListVisibleInfo())
})

/** The most the server hands out at once (helpers.ListPageMax). */
const SERVER_MAX = 5000

const task = (i: number) => ({
  task_uuid: `task-${i + 1}`,
  task_name: `Task ${i + 1}`,
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_project: { project_uuid: "p", project_name: "Billing", project_is_admin: true },
})
type Task = ReturnType<typeof task>

/**
 * The server's paging (helpers.ListPaging): a page size over its most is its
 * most, page n starts at n times the size, pageCount counts the pages there
 * are at that size, and an empty page leaves its list out.
 */
function server(tasks: Task[], list: "project_tasks" | "user_tasks") {
  serve = (url) => {
    const size = Math.min(Number(url.searchParams.get("pageSize")), SERVER_MAX)
    const index = Number(url.searchParams.get("pageIndex"))
    const page = tasks.slice(index * size, index * size + size)
    const own = list === "project_tasks" ? { project_uuid: "p", project_name: "Billing", project_is_admin: true } : {}
    return { msg: "ok", data: { ...own, ...(page.length ? { [list]: page } : {}) }, pageCount: Math.ceil(tasks.length / size) }
  }
}

/** The table read to its end, as someone pressing "Show more" while it is offered. */
function readToTheEnd(table: () => ReactElement) {
  const view = render(<Provider store={store}>{table()}</Provider>)
  for (let i = 0; i < 40; i++) {
    const more = screen.queryByRole("button", { name: "Show more tasks" })
    if (!more) break
    fireEvent.click(more)
  }
  return { drawAgain: () => view.rerender(<Provider store={store}>{table()}</Provider>) }
}

const pagesAsked = () =>
  asked.map((u) => {
    const q = new URL(u, "http://app").searchParams
    return { size: Number(q.get("pageSize")), index: Number(q.get("pageIndex")) }
  })
const listed = () => store.getState().TaskInfo.taskListVisibleInfo.map((t) => t.task_uuid)
/** The groups' counts, as their headers say them ("N+" while more is to come). */
const groupCounts = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-group-count] [data-count-tick]")].map((el) => el.getAttribute("aria-label") ?? el.textContent)

const tables = [
  { name: "a project's", list: "project_tasks" as const, table: () => <ProjectTaskTable projectId="p" /> },
  { name: "My Tasks'", list: "user_tasks" as const, table: () => <MyTaskTable /> },
]

describe.each(tables)("$name task table, a page at a time", ({ list, table }) => {
  it("reaches the last of more than 5,000 tasks through Show more, and asks for no page past the last", () => {
    const tasks = Array.from({ length: SERVER_MAX + 250 }, (_, i) => task(i))
    server(tasks, list)
    readToTheEnd(table)

    // Every task, in the server's order, each once: the last one among them.
    expect(listed()).toEqual(tasks.map((t) => t.task_uuid))
    // Eleven pages of 500, each asked for once, and none past the last.
    const pages = Math.ceil(tasks.length / TASK_PAGE)
    expect(pagesAsked()).toEqual(Array.from({ length: pages }, (_, index) => ({ size: TASK_PAGE, index })))
    // The last page in, nothing more is offered, and the count is the list's own.
    expect(screen.queryByRole("button", { name: "Show more tasks" })).toBeNull()
    expect(groupCounts(document.body)).toContain(String(tasks.length))
    expect(groupCounts(document.body).some((c) => c?.endsWith("+"))).toBe(false)
    // No count said it was the whole list before the whole list was in (PROJ-BUG-2).
    const exact = drawn.filter((d) => !d.loading && !d.partial)
    expect(exact.length).toBeGreaterThan(0)
    expect(exact.every((d) => d.count === tasks.length)).toBe(true)
  })

  it("offers no more and asks for no second page when the first is the whole list", () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task(i))
    server(tasks, list)
    readToTheEnd(table)
    expect(listed()).toEqual(tasks.map((t) => t.task_uuid))
    expect(pagesAsked()).toEqual([{ size: TASK_PAGE, index: 0 }])
    expect(screen.queryByRole("button", { name: "Show more tasks" })).toBeNull()
  })

  it("takes in a task made on its one page with its counts exact throughout, and asks for nothing more", () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task(i))
    server(tasks, list)
    const { drawAgain } = readToTheEnd(table)
    const shownAt = drawn.length
    // As useTaskUpdate's optimisticCreateTask makes one: on top of the first page's answer.
    const made = task(7)
    const [first] = asked
    const before = answers.get(first) as { data: { data: Record<string, unknown> } }
    answers.set(first, { ...before, data: { ...before.data, data: { ...before.data.data, [list]: [made, ...tasks] } } })
    drawAgain()
    expect(listed()).toEqual([made, ...tasks].map((t) => t.task_uuid))
    expect(drawn.slice(shownAt).some((d) => d.partial)).toBe(false)
    expect(pagesAsked()).toEqual([{ size: TASK_PAGE, index: 0 }])
  })
})

describe("the list a table's pages make", () => {
  const t = (id: string, name = id) => ({ ...task(0), task_uuid: id, task_name: name }) as unknown as TaskInfoInterface

  it("keeps each task once, where it came first, when the list moved between two pages' reads", () => {
    // A task made after the first page was read pushed its last task into the second.
    const out = joinPages([[t("a"), t("b")], [t("b"), t("c")]], () => true, [])
    expect(out.map((x) => x.task_uuid)).toEqual(["a", "b", "c"])
  })

  it("takes a changed page's tasks from its answer, and every other page's from the list", () => {
    // "b" was renamed in the list alone (a GitHub sync), after its page's answer.
    const listedNow = [t("a"), t("b", "Renamed on GitHub"), t("c")]
    const out = joinPages([[t("a"), t("b")], [t("c", "Edited here")]], (page) => page === 1, listedNow)
    expect(out.map((x) => x.task_name)).toEqual(["a", "Renamed on GitHub", "Edited here"])
  })

  it("waits for a page not read yet before the pages after it", () => {
    const rows = [[t("a")]]
    rows[2] = [t("c")]
    expect(joinPages(rows, () => true, []).map((x) => x.task_uuid)).toEqual(["a"])
  })
})
