import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"

// A project's board and its column order (design/projects-vs-asana-jira/
// BOARD_COLUMNS_PLAN.md): only someone who manages the project gets the
// order to drag, only on columns of statuses. Another admin's change to the
// order reaches the board through the app's message router
// (hooks/projectStatusesLive.test.ts), on the project's topic, which the open
// board takes up for a project joined since the connection was made.

const h = vi.hoisted(() => ({
  admin: true,
  ordering: [] as unknown[],
  saved: [] as string[][],
  topics: new Set<string>(),
  handled: false,
}))
const P = "p-launch"

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    if (key.startsWith("/project/taskListForKanban/")) {
      const access = h.admin
        ? { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
        : { role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "own", log_time: true, post_updates: true, add_files: true, manage: false, manage_people: false, archive: false }
      return {
        data: { data: { project_access: access, project_tasks_backlog: [], project_tasks_todo: [{ task_uuid: "t1", task_name: "Task t1", task_status: "todo", task_priority: "low", task_label: "" }], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [] } },
        isLoading: false,
        mutate: vi.fn(),
      }
    }
    return { data: undefined, isLoading: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: false }),
}))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: BUILT_IN_STATUSES, isLoading: false }) }))
vi.mock("@/hooks/useProjectStatusOrder", () => ({ useProjectStatusOrder: () => async (order: string[]) => void h.saved.push(order) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [] }), usePeople: () => ({ nameOf: () => undefined, people: [] }) }))
vi.mock("@/lib/liveEntity", () => ({ useLiveEntity: () => ({ state: "ok", topic: "project/p-launch" }) }))
vi.mock("@/hooks/useMqttTopic", () => ({
  useMqttTopic: ({ topic, onMessage }: { topic: string; onMessage?: unknown }) => {
    if (topic) h.topics.add(topic)
    if (onMessage) h.handled = true
    return { isConnected: true }
  },
}))
vi.mock("@/components/kanbanComponents/TaskBoard", () => ({
  TaskBoard: ({ columnOrder }: { columnOrder?: unknown }) => {
    h.ordering.push(columnOrder)
    return <div data-testid="board" />
  },
  columnPaging: () => ({ closed: false }),
  BOARD_CLOSED_STEP: 200,
  BOARD_CLOSED_MAX: 2000,
  BOARD_OPEN_STEP: 1000,
  BOARD_OPEN_MAX: 5000,
}))
vi.mock("@/components/task/KeyboardList", () => ({ KeyboardList: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => `/app/project/${P}` }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { ProjectTaskKanban } = await import("./projectTaskKanban")

afterEach(() => {
  cleanup()
  h.admin = true
  h.ordering.length = 0
  h.saved.length = 0
  h.topics.clear()
  h.handled = false
  localStorage.clear()
})

type Ordering = { order: string[]; closed: (v: string) => boolean; onChange: (o: string[]) => void }
const last = () => h.ordering.at(-1) as Ordering | undefined

describe("a project's board and its column order", () => {
  it("gives a project admin the order: every status, closed ones known, a move saved", async () => {
    render(<ProjectTaskKanban projectId={P} />)
    const o = last()!
    expect(o.order).toEqual(BUILT_IN_STATUSES.map((s) => s.value))
    expect(o.closed("done") && o.closed("canceled") && !o.closed("todo")).toBe(true)
    await act(async () => o.onChange(["todo", "backlog", "inProgress", "inReview", "done", "canceled"]))
    expect(h.saved).toEqual([["todo", "backlog", "inProgress", "inReview", "done", "canceled"]])
  })

  it("gives a member none", () => {
    h.admin = false
    render(<ProjectTaskKanban projectId={P} />)
    expect(last()).toBeUndefined()
  })

  it("gives none on a board of people", () => {
    localStorage.setItem(`oc_board_grouping:${P}`, JSON.stringify("assignee"))
    render(<ProjectTaskKanban projectId={P} />)
    expect(last()).toBeUndefined()
  })

  it("takes up its project's topic and leaves its messages to the app's router", () => {
    render(<ProjectTaskKanban projectId={P} />)
    expect([...h.topics]).toEqual(["project/p-launch"])
    expect(h.handled).toBe(false)
  })
})
