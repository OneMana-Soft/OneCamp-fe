import { act, cleanup, render, screen } from "@testing-library/react"
import { Profiler, type ComponentProps } from "react"
import { Provider } from "react-redux"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

// The tasks' dates (made, due) are read against a fixed today.
pinTestClock()
import type { RowProp } from "@/components/task/GroupedTaskList"

// F-1 #1 (FLUIDITY-LEAD, 20 Oct, beta 482460c3d): a page of tasks arriving
// drew every row already in the list again (19,337 renders, TaskRow ×980), and
// opening the board drew the hidden list again (47,749). A row draws again only
// when its own task or state changes. Each row's title is counted.

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

// The project page's address: ?tab= changes when the board opens.
const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  router: { push: () => {}, replace: () => {}, prefetch: () => {} },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => nav.params,
  usePathname: () => "/app/project/p",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

const task = (i: number) =>
  ({
    task_uuid: `7a5c00f1-0000-4000-8000-${String(i).padStart(12, "0")}`,
    task_name: `Task ${i}`,
    task_status: i % 2 ? "inProgress" : "todo",
    task_priority: "medium",
    task_label: "",
    task_due_date: "",
    task_start_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_sub_task_count: 0,
    task_comment_count: 0,
  }) as unknown as TaskInfoInterface

// The project's first page as the server answers it, read by the list's pages
// (one object, as SWR keeps one answer).
const page = vi.hoisted(() => ({ read: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => {
  const nothing = { data: undefined, isLoading: false, isError: undefined, mutate: async () => undefined }
  return {
    useFetch: (url: string) => (url.startsWith("/project/taskList/") && page.read ? page.read : nothing),
    useFetchOnlyOnce: () => nothing,
    useMediaFetch: () => nothing,
  }
})

const { default: store } = await import("@/store/store")
const { GroupedTaskList } = await import("@/components/task/GroupedTaskList")
const { ProjectTaskTable } = await import("@/components/project/projectTaskTable")
const { BUILT_IN_STATUSES } = await import("@/lib/taskStatus")

afterEach(() => {
  cleanup()
  drawn.names = []
  nav.params = new URLSearchParams()
  page.read = undefined
})

// One array for the list's life, as the Display menu's state is.
const PROPS: RowProp[] = ["priority", "due", "assignee"]
const canEdit = () => true

describe("the list's rows", () => {
  it("a page arriving draws only its own rows", () => {
    const first = Array.from({ length: 40 }, (_, i) => task(i))
    const more = Array.from({ length: 20 }, (_, i) => task(40 + i))
    const list = (tasks: TaskInfoInterface[]) => (
      <Provider store={store}>
        <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROPS} canEdit={canEdit} projectId="p" />
      </Provider>
    )
    const { rerender } = render(list(first))
    expect(new Set(drawn.names).size).toBe(40)
    drawn.names = []
    rerender(list([...first, ...more]))
    expect(drawn.names.filter((n) => first.some((t) => t.task_name === n))).toEqual([])
    expect(drawn.names).toHaveLength(more.length)
  })

  // fluid-19: a project's first page (about 200 rows) drawn whole in one commit was its longest task, and a screen then
  // the rest in one transition still a long one. Rows drawn by each commit's end are counted at the commit (a Profiler's onRender).
  const listOf = (tasks: TaskInfoInterface[], commits: number[]) => (
    <Provider store={store}>
      <Profiler id="list" onRender={() => commits.push(drawn.names.length)}>
        <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROPS} canEdit={canEdit} projectId="p" />
      </Profiler>
    </Provider>
  )
  // Four open groups of fifty: each under its sixty, so every row is shown, and 200 in all, so none is windowed.
  const OPEN = ["backlog", "todo", "inProgress", "inReview"]
  const page200 = () => Array.from({ length: 200 }, (_, i) => ({ ...task(i), task_status: OPEN[i % 4] }) as TaskInfoInterface)

  it("a first page of 200 rows commits a screen of them, then the rest a screen at a time: every row drawn, each once (fluid-19)", () => {
    const commits: number[] = []
    render(listOf(page200(), commits))
    // The first commit draws one screen, as the window's first draw does; no later commit draws more than a screen.
    expect(commits[0]).toBe(30)
    const steps = commits.map((n, i) => n - (i ? commits[i - 1] : 0))
    expect(Math.max(...steps)).toBeLessThanOrEqual(30)
    expect(commits.filter((n, i) => n > (i ? commits[i - 1] : 0)).length).toBeGreaterThan(5)
    // Find-in-page finds every row, and no row is drawn again.
    expect(commits.at(-1)).toBe(200)
    expect(new Set(drawn.names).size).toBe(200)
    expect(drawn.names).toHaveLength(200)
  })

  it("a list filled stays whole: a page that takes it to 200 rows draws all its new rows in one commit (fluid-19)", () => {
    const tasks = page200()
    const commits: number[] = []
    const { rerender } = render(listOf(tasks.slice(0, 60), commits))
    expect(commits[0]).toBe(30)
    expect(drawn.names).toHaveLength(60)
    drawn.names = []
    commits.length = 0
    rerender(listOf(tasks, commits))
    expect(commits[0]).toBe(140)
    expect(drawn.names).toHaveLength(140)
  })

  it("a list of a screen or less draws whole in its first commit (fluid-19)", () => {
    const commits: number[] = []
    render(listOf(page200().slice(0, 30), commits))
    expect(commits[0]).toBe(30)
    expect(drawn.names).toHaveLength(30)
  })

  it("opening the board, a change of address, draws no row of the hidden list again", async () => {
    const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", manage: true, manage_people: true, archive: true }
    page.read = {
      data: { msg: "ok", pageCount: 1, data: { project_uuid: "p", project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_access: admin, project_tasks: Array.from({ length: 40 }, (_, i) => task(i)) } },
      isLoading: false,
      isError: undefined,
      mutate: async () => undefined,
    }
    const view = () => (
      <Provider store={store}>
        <ProjectTaskTable projectId="p" />
      </Provider>
    )
    const { rerender } = render(view())
    expect(await screen.findByText("Task 39")).toBeTruthy()
    // The drag's layer arrives when the page is idle (a timer in jsdom).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    drawn.names = []
    nav.params = new URLSearchParams({ tab: "kanban" })
    rerender(view())
    expect(drawn.names).toEqual([])
  })
})
