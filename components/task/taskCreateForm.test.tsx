import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"

// The New task form, as the dialog shows it, with the project list and the
// request standing in for the server.

type Project = {
  project_uuid: string
  project_name: string
  project_team: { team_name: string }
  project_members: { user_uuid: string; user_name: string }[]
}
const project = (uuid: string, name: string, members: string[] = ["Maya"]): Project => ({
  project_uuid: uuid,
  project_name: name,
  project_team: { team_name: "Product" },
  project_members: members.map((m) => ({ user_uuid: `u-${m}`, user_name: m })),
})

// The project list, as SWR has it: what the test sets, the same object until it changes.
let projects: { data: Project[] } | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: projects, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
const send = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: send, isSubmitting: false }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToCreateTask: () => {} }) }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ optimisticCreateTask: () => {}, revalidateTaskKeys: () => {} }) }))
vi.mock("@/components/textInput/textInput", () => ({ default: () => null }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import store from "@/store/store"
import TaskCreateForm from "./taskCreateForm"

const form = (props: { defaultProjectId?: string } = {}) => (
  <Provider store={store}>
    <TaskCreateForm {...props} />
  </Provider>
)
const nameIt = (name = "Write the launch notes") => fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } })
const create = async () => {
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Create task" })))
}
const sentProject = () => (send.mock.calls.at(-1)?.[0] as { payload: { task_project_uuid: string } }).payload.task_project_uuid
const pickerOpen = () => screen.queryByPlaceholderText("Select project…") !== null

beforeEach(() => {
  send.mockReset()
  send.mockResolvedValue({ task_uuid: "t1" })
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("the project a new task starts in", () => {
  it("is picked again when the list that comes back no longer has it", async () => {
    localStorage.setItem("onecamp:last-task-project", "p2")
    projects = { data: [project("p1", "Launch"), project("p2", "Roadmap")] } // an older copy
    const view = render(form())
    expect(screen.getByRole("button", { name: /Roadmap/ })).toBeTruthy()

    projects = { data: [project("p1", "Launch")] } // Roadmap was deleted since
    view.rerender(form())
    await waitFor(() => expect(screen.getByRole("button", { name: /Launch/ })).toBeTruthy())
    nameIt()
    await create()
    expect(sentProject()).toBe("p1")
  })

  it("is left for the person to pick when several are left", async () => {
    localStorage.setItem("onecamp:last-task-project", "p2")
    projects = { data: [project("p1", "Launch"), project("p2", "Roadmap")] }
    const view = render(form())
    projects = { data: [project("p1", "Launch"), project("p3", "Hiring")] }
    view.rerender(form())
    await waitFor(() => expect(screen.getByRole("button", { name: "Pick a project" })).toBeTruthy())
    nameIt()
    await create()
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText("Pick a project for the task.")).toBeTruthy()
  })

  it("is shown as the latest list has it: its name and its members", async () => {
    projects = { data: [project("p1", "Launch", ["Maya"])] }
    const view = render(form())
    expect(screen.getByRole("button", { name: /Launch/ })).toBeTruthy()
    projects = { data: [project("p1", "Launch week", ["Maya", "Sam"])] }
    view.rerender(form())
    expect(screen.getByRole("button", { name: /Launch week/ })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Pick someone" }))
    expect(await screen.findByText("Sam")).toBeTruthy()
  })

  it("stays the caller's, though the list (projects you run) doesn't have it", async () => {
    projects = { data: [project("p1", "Launch"), project("p2", "Roadmap")] }
    render(form({ defaultProjectId: "p9" }))
    nameIt()
    await create()
    expect(sentProject()).toBe("p9")
  })
})

describe("pressing Create with something missing", () => {
  it("opens the project picker when the project is all that's missing", async () => {
    projects = { data: [project("p1", "Launch"), project("p2", "Roadmap")] }
    render(form())
    nameIt()
    await create()
    expect(pickerOpen()).toBe(true)
  })

  it("leaves the picker shut when the name is wrong too, so focus can go to the name", async () => {
    projects = { data: [project("p1", "Launch"), project("p2", "Roadmap")] }
    render(form())
    await create()
    expect(screen.getByText("Task name must be at least 4 characters")).toBeTruthy()
    expect(screen.getByText("Pick a project for the task.")).toBeTruthy()
    expect(pickerOpen()).toBe(false)
    expect(document.activeElement).toBe(screen.getByLabelText("Name"))
  })

  it("says what's wrong with a GitHub link, and goes to it", async () => {
    projects = { data: [project("p1", "Launch")] }
    render(form())
    nameIt()
    const github = screen.getByLabelText("GitHub issue or pull request (optional)")
    fireEvent.change(github, { target: { value: "https://example.com/issue/1" } })
    await create()
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText(/Must be a (valid )?GitHub/)).toBeTruthy()
    expect(document.activeElement).toBe(github)
  })
})

describe("clearing a date", () => {
  it.each(["Start date", "Due date"])("clears the %s and creates nothing", async (which) => {
    projects = { data: [project("p1", "Launch")] }
    render(form())
    nameIt()
    fireEvent.click(screen.getByRole("button", { name: new RegExp(which) }))
    const day = (await screen.findAllByRole("gridcell")).find((cell) => cell.textContent === "15")
    fireEvent.click(day!.querySelector("button") ?? day!)
    const clear = await screen.findByRole("button", { name: `Clear ${which.toLowerCase()}` })
    await act(async () => void fireEvent.click(clear))
    expect(send).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: `Clear ${which.toLowerCase()}` })).toBeNull()
  })
})
