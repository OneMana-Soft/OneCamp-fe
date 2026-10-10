import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

/**
 * A task table's first rows reach it through the store, an effect after the
 * answer arrives. In between, the table said "No tasks yet" (with its spot)
 * for a frame, and its pagination, drawn under the skeleton, moved down as the
 * rows came in: a layout shift opening a project. The skeleton now holds until
 * the rows are in, and the pagination waits with it.
 */
const h = vi.hoisted(() => ({
  answer: { data: undefined, isLoading: true } as { data: unknown; isLoading: boolean },
  // false: the answer is in, but the effect that copies its rows into the store hasn't run.
  reachesStore: false,
  store: undefined as { dispatch: (action: { type: string }) => unknown } | undefined,
}))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) =>
    key.startsWith("/project/taskList/") || key.startsWith("/user/assignedTaskList") ? h.answer : { data: undefined, isLoading: false },
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: false }),
}))
vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useDispatch: () => (action: { type: string }) => {
    if (h.reachesStore || action.type.startsWith("TaskInfo/clear")) h.store?.dispatch(action)
  },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

const { default: store } = await import("@/store/store")
h.store = store
const { ProjectTaskTable } = await import("@/components/project/projectTaskTable")
const { MyTaskTable } = await import("@/components/myTask/myTaskTable")

const TASK = {
  task_uuid: "t1",
  task_name: "Review the pricing page copy",
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_project: { project_uuid: "p", project_name: "Q4 launch", project_is_admin: true },
}

afterEach(() => {
  cleanup()
  h.answer = { data: undefined, isLoading: true }
  h.reachesStore = false
})

const skeletonRows = (container: HTMLElement) => container.querySelectorAll('tbody tr[aria-hidden="true"]').length

describe("a task table's first load", () => {
  it("a project's: the skeleton holds, and the pagination waits, until the answer's rows are in", () => {
    h.answer = { data: { data: { project_tasks: [TASK], project_task_count: 1 } }, isLoading: false }
    const { container } = render(<Provider store={store}><ProjectTaskTable projectId="p" /></Provider>)
    expect(screen.queryByText("No tasks yet")).toBeNull()
    expect(skeletonRows(container)).toBeGreaterThan(0)
    expect(screen.queryByText(/Rows per page/)).toBeNull()
  })

  it("a project with no tasks says so, with its pagination", () => {
    h.answer = { data: { data: { project_tasks: [], project_task_count: 0 } }, isLoading: false }
    const { container } = render(<Provider store={store}><ProjectTaskTable projectId="p" /></Provider>)
    expect(screen.getByText("No tasks yet")).toBeTruthy()
    expect(skeletonRows(container)).toBe(0)
    expect(screen.getAllByText(/Rows per page/).length).toBeGreaterThan(0)
  })

  it("My Tasks': the skeleton holds, and the pagination waits, until the answer's rows are in", () => {
    h.answer = { data: { data: { user_tasks: [TASK] }, pageCount: 1 }, isLoading: false }
    const { container } = render(<Provider store={store}><MyTaskTable /></Provider>)
    expect(screen.queryByText("Nothing is assigned to you.")).toBeNull()
    expect(skeletonRows(container)).toBeGreaterThan(0)
    expect(screen.queryByText(/Rows per page/)).toBeNull()
  })

  it("nothing assigned says so, with its pagination", () => {
    h.answer = { data: { data: { user_tasks: [] }, pageCount: 1 }, isLoading: false }
    render(<Provider store={store}><MyTaskTable /></Provider>)
    expect(screen.getByText("Nothing is assigned to you.")).toBeTruthy()
    expect(screen.getAllByText(/Rows per page/).length).toBeGreaterThan(0)
  })
})
