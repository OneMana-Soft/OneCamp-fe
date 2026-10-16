import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"

// A project's board shares the list's toolbar (PTC-6) and names the statuses
// it hides (PTC-5). It drew Assignee and Priority chips of its own, with no
// Filter, Search or Cycle, and hid Backlog, In review and Cancelled without a
// word, so a task in Backlog was nowhere to be seen.

const h = vi.hoisted(() => ({ keys: [] as string[] }))
const P = "p-launch"
const card = (id: string, status: string) => ({ task_uuid: id, task_name: `Task ${id}`, task_status: status, task_priority: "low", task_label: "" })

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    h.keys.push(key)
    if (key.startsWith("/project/taskListForKanban/")) {
      return {
        data: {
          data: {
            project_is_admin: true,
            project_tasks_backlog: [card("b1", "backlog")],
            project_tasks_todo: [card("t1", "todo"), card("t2", "todo")],
            project_tasks_in_progress: [],
            project_tasks_in_review: [],
            project_tasks_done: [],
            project_tasks_canceled: [],
            project_column_counts: { backlog: 1, todo: 2, inProgress: 0, inReview: 0, done: 0, canceled: 3 },
          },
        },
        isLoading: false,
        mutate: vi.fn(),
      }
    }
    return { data: undefined, isLoading: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: false }),
}))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: BUILT_IN_STATUSES }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [] }), usePeople: () => ({ nameOf: () => undefined, people: [] }) }))
vi.mock("@/components/kanbanComponents/TaskBoard", () => ({
  TaskBoard: ({ visible }: { visible: { value: string }[] }) => <div data-testid="board">{visible.map((o) => o.value).join(",")}</div>,
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
  h.keys.length = 0
  document.cookie.split(";").forEach((c) => (document.cookie = `${c.split("=")[0].trim()}=; Max-Age=0; path=/`))
})

const boardKeys = () => h.keys.filter((k) => k.startsWith("/project/taskListForKanban/"))

describe("a project's board", () => {
  it("has the list's toolbar: Filter, search, its own Display, New task", () => {
    render(<ProjectTaskKanban projectId={P} />)
    expect(screen.getByRole("button", { name: /^Filter$/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Search tasks" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Display" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "New task" })).toBeTruthy()
  })

  it("names the statuses it hides, and Show brings them back", () => {
    render(<ProjectTaskKanban projectId={P} />)
    expect(screen.getByText("3 statuses hidden")).toBeTruthy()
    expect(screen.getByTestId("board").textContent).toBe("todo,inProgress,done")
    fireEvent.click(screen.getByRole("button", { name: "Show Backlog (1), In review, Cancelled (3)" }))
    expect(screen.getByTestId("board").textContent).toBe("backlog,todo,inProgress,inReview,done,canceled")
    expect(screen.queryByText(/statuses hidden/)).toBeNull()
  })

  it("asks the server for what its search names, as the list does", async () => {
    vi.useFakeTimers()
    try {
      render(<ProjectTaskKanban projectId={P} />)
      expect(boardKeys().every((k) => !k.includes("filters="))).toBe(true)
      fireEvent.click(screen.getByRole("button", { name: "Search tasks" }))
      fireEvent.change(screen.getByRole("textbox", { name: "Search tasks" }), { target: { value: "retro" } })
      await act(async () => {
        vi.advanceTimersByTime(350)
      })
      const last = new URL(boardKeys().at(-1)!, "http://x")
      expect(JSON.parse(last.searchParams.get("filters") ?? "[]")).toEqual([{ id: "task_name", value: "retro" }])
    } finally {
      vi.useRealTimers()
    }
  })
})
