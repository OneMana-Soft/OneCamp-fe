import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"
import type { ReactElement } from "react"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"

// UX-PROJECTS-H1 (PROJECTS-24): an empty view says what belongs there and
// gives the one next step. A project's board and My tasks' board said "No
// tasks yet" with no button; a project's list offered Import to everyone,
// though only a workspace's admins can import.

const h = vi.hoisted(() => ({ createTasks: true, workspaceAdmin: false, pushed: [] as string[] }))
const P = "p-launch"
const access = () => ({
  role: "member", view: true, comment: true, create_tasks: h.createTasks, edit_tasks: h.createTasks ? "all" : "none", delete_tasks: "own",
  log_time: true, post_updates: true, add_files: true, manage: false, manage_people: false, archive: false,
})

// One answer object per address, as SWR keeps it (a new one each render reads as a change).
const answers = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@/hooks/useFetch", () => {
  const nothing = { data: undefined, isLoading: false, isError: undefined, mutate: async () => undefined }
  const kept = (key: string, data: () => unknown) => {
    if (!answers.has(key)) answers.set(key, { ...nothing, data: data() })
    return answers.get(key)
  }
  return {
    useFetch: (key: string) => {
      if (key.startsWith("/project/taskListForKanban/"))
        return kept(key, () => ({ data: { project_uuid: P, project_name: "Launch", project_access: access(), project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [] } }))
      if (key.startsWith("/user/assignedTaskListForKanban"))
        return kept(key, () => ({ data: { user_tasks_backlog: [], user_tasks_todo: [], user_tasks_in_progress: [], user_tasks_in_review: [], user_tasks_done: [], user_tasks_canceled: [] } }))
      if (key.startsWith("/project/taskList/")) return kept(key, () => ({ msg: "ok", data: { project_uuid: P, project_name: "Launch", project_access: access() }, pageCount: 0 }))
      return nothing
    },
    useFetchOnlyOnce: (key: string) => (key === "/user/profile" ? kept(key, () => ({ data: { user_uuid: "u-me", user_is_admin: h.workspaceAdmin } })) : nothing),
    useMediaFetch: () => nothing,
  }
})
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: BUILT_IN_STATUSES, isLoading: false }) }))
vi.mock("@/hooks/useProjectStatusOrder", () => ({ useProjectStatusOrder: () => async () => undefined }))
vi.mock("@/lib/liveEntity", () => ({ useLiveEntity: () => ({ state: "ok", topic: `project/${P}` }) }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => ({ isConnected: true }) }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (to: string) => void h.pushed.push(to), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/app/project/${P}`,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { default: store } = await import("@/store/store")
const { closeUI } = await import("@/store/slice/uiSlice")
const { ProjectTaskKanban } = await import("./projectTaskKanban")
const { ProjectTaskTable } = await import("./projectTaskTable")
const { MyTaskKanban } = await import("@/components/myTask/myTaskKanban")
const { ProjectTaskList } = await import("./projectTaskList")

afterEach(() => {
  cleanup()
  store.dispatch(closeUI("createTask"))
  h.createTasks = true
  h.workspaceAdmin = false
  h.pushed.length = 0
  answers.clear()
  localStorage.clear()
})

const show = (ui: ReactElement) => render(<Provider store={store}>{ui}</Provider>)
/** The empty state its title heads (a desktop view draws it in its WorkState; the phone's list draws it bare). */
const empty = (title: string | RegExp) => {
  const heading = screen.getByRole("heading", { name: title })
  return within(heading.closest<HTMLElement>("[data-work-state]") ?? heading.parentElement!.parentElement!)
}
const composer = () => store.getState().ui.createTask

describe("an empty view's next step", () => {
  it("a project's board with no tasks offers New task, in that project", async () => {
    show(<ProjectTaskKanban projectId={P} />)
    await act(async () => void fireEvent.click(empty("No tasks yet").getByRole("button", { name: "New task" })))
    expect(composer().isOpen).toBe(true)
    expect(composer().data).toMatchObject({ projectId: P })
  })

  it("offers no New task on a board whose reader can't add tasks", () => {
    h.createTasks = false
    show(<ProjectTaskKanban projectId={P} />)
    expect(empty("No tasks yet").queryByRole("button", { name: "New task" })).toBeNull()
  })

  it("My tasks' board with nothing assigned offers New task, assigned to the reader", async () => {
    show(<MyTaskKanban />)
    await act(async () => void fireEvent.click(empty("Nothing assigned to you").getByRole("button", { name: "New task" })))
    expect(composer().isOpen).toBe(true)
    expect(composer().data).toMatchObject({ assignToMe: true })
  })

  // One empty state, as the design review asked (F2 of 3ef857030): the board
  // and the phone's list said "Create one and it shows here." with no Import,
  // to an admin too, while the desktop list offered it.
  const VIEWS = [
    ["list", () => <ProjectTaskTable projectId={P} />],
    ["board", () => <ProjectTaskKanban projectId={P} />],
    ["phone list", () => <ProjectTaskList projectId={P} searchQuery="" />],
  ] as const
  for (const [name, view] of VIEWS) {
    it(`a project's empty ${name} offers Import to a workspace admin`, async () => {
      h.workspaceAdmin = true
      show(view())
      await screen.findByRole("heading", { name: "No tasks yet" })
      const state = empty("No tasks yet")
      expect(state.getByText("Make the first one, or bring them in from Linear, Jira, Asana or Trello.")).toBeTruthy()
      await act(async () => void fireEvent.click(state.getByRole("button", { name: "Import" })))
      expect(h.pushed).toEqual(["/app/admin?tab=import"])
    })

    // B63 T1 U26: New task follows the project's create_tasks, not the workspace's admin flag.
    it(`a project's empty ${name} offers an admin who can't add tasks Import, and no New task`, async () => {
      h.workspaceAdmin = true
      h.createTasks = false
      show(view())
      await screen.findByRole("heading", { name: "No tasks yet" })
      const state = empty("No tasks yet")
      expect(state.getByRole("button", { name: "Import" })).toBeTruthy()
      expect(state.queryByRole("button", { name: "New task" })).toBeNull()
    })

    it(`a project's empty ${name} tells anyone else who can import, with no button that would refuse them`, async () => {
      show(view())
      await screen.findByRole("heading", { name: "No tasks yet" })
      const state = empty("No tasks yet")
      expect(state.queryByRole("button", { name: "Import" })).toBeNull()
      expect(state.getByText("Bring tasks in from Linear, Jira, Asana or Trello: a workspace admin can import them.")).toBeTruthy()
      expect(state.getByRole("button", { name: "New task" })).toBeTruthy()
    })
  }
})
