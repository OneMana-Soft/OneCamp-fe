import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

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
let projects: { data: (Project & { project_key?: string })[] } | undefined
// The picked project's statuses (hooks/useProjectStatuses): its custom ones, when a test gives them.
let statuses: { data: { built_in: []; custom: { id: string; project_id: string; name: string; category: string; color: string; position: number }[]; colors: string[]; max: number } } | undefined
// The signed-in person (the self profile), for a form opened from My Tasks.
let selfProfile: { data: { user_uuid: string } } | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: key.endsWith("/statuses") ? statuses : key ? projects : undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: selfProfile }),
}))
const send = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: send, isSubmitting: false }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToCreateTask: () => {} }) }))
// The lists' own copy: the row the form shows at once, and taking it off again.
const lists = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }))
vi.mock("@/hooks/useTaskUpdate", () => ({
  useTaskUpdate: () => ({ optimisticCreateTask: lists.create, optimisticDeleteTask: lists.remove, revalidateTaskKeys: () => {} }),
}))
vi.mock("@/components/textInput/textInput", () => ({ default: () => null }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import store from "@/store/store"
import TaskCreateForm from "./taskCreateForm"
import { placeAddress, type PlacedAddress } from "@/lib/task/newTaskAddress"

const form = (props: { defaultProjectId?: string; assignToMe?: boolean; address?: PlacedAddress } = {}) => (
  <Provider store={store}>
    <TaskCreateForm {...props} />
  </Provider>
)
const nameIt = (name = "Write the launch notes") => fireEvent.change(screen.getByLabelText("Task title"), { target: { value: name } })
const create = async () => {
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Create task" })))
}
const sentProject = () => (send.mock.calls.at(-1)?.[0] as { payload: { task_project_uuid: string } }).payload.task_project_uuid
const pickerOpen = () => screen.queryByPlaceholderText("Select project…") !== null
const sentPayload = () => (send.mock.calls.at(-1)?.[0] as { payload: Record<string, unknown> }).payload
const pick = async (name: RegExp) => {
  await act(async () => void fireEvent.click(screen.getByRole("option", { name })))
}

pinTestClock()

beforeEach(() => {
  lists.create.mockReset()
  lists.remove.mockReset()
  send.mockReset()
  send.mockResolvedValue({ task_uuid: "t1" })
  selfProfile = undefined
  statuses = undefined
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
    expect(screen.getByText("Task name can't be empty")).toBeTruthy()
    expect(screen.getByText("Pick a project for the task.")).toBeTruthy()
    expect(pickerOpen()).toBe(false)
    expect(document.activeElement).toBe(screen.getByLabelText("Task title"))
  })

  it("says what's wrong with a GitHub link, and goes to it", async () => {
    projects = { data: [project("p1", "Launch")] }
    render(form())
    nameIt()
    fireEvent.click(screen.getByRole("button", { name: "Link a GitHub issue or pull request" }))
    const github = screen.getByLabelText("GitHub issue or pull request (optional)")
    fireEvent.change(github, { target: { value: "https://example.com/issue/1" } })
    await create()
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText(/Must be a (valid )?GitHub/)).toBeTruthy()
    expect(document.activeElement).toBe(github)
  })
})

// Create, pressed with only the project missing, opens the picker; picking
// one there is the answer it asked for and finishes the create. The person
// pressed Create once already, and had to press it again (the buyer journey
// stopped there).
describe("picking the project Create asked for", () => {
  beforeEach(() => {
    projects = { data: [project("p1", "Launch", ["Maya", "Sam"]), project("p2", "Roadmap", ["Maya", "Sam"])] }
  })

  it("finishes the create: one request, in the project picked", async () => {
    render(form())
    nameIt()
    await create()
    expect(pickerOpen()).toBe(true)
    expect(send).not.toHaveBeenCalled()
    await pick(/Roadmap/)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentProject()).toBe("p2")
    expect(pickerOpen()).toBe(false)
  })

  it("from My Tasks, sends the task as yours, in a project you belong to", async () => {
    selfProfile = { data: { user_uuid: "u-Sam" } }
    render(form({ assignToMe: true }))
    nameIt()
    await create()
    await pick(/Roadmap/)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    // Not left to the effect that makes it yours: that runs after the pick
    // has rendered, and the request would have gone without anyone on it.
    expect(sentPayload().task_assignee_uuid).toBe("u-Sam")
    expect(sentProject()).toBe("p2")
  })

  it("closing the picker without a pick sends nothing, and the next Create asks again", async () => {
    render(form())
    nameIt()
    await create()
    fireEvent.keyDown(screen.getByPlaceholderText("Select project…"), { key: "Escape" })
    await waitFor(() => expect(pickerOpen()).toBe(false))
    await create()
    await act(async () => void fireEvent.pointerDown(document.body))
    await waitFor(() => expect(pickerOpen()).toBe(false))
    expect(send).not.toHaveBeenCalled()
    await create()
    await pick(/Launch/)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentProject()).toBe("p1")
  })

  it("a pick in the picker opened by hand only picks, until Create", async () => {
    render(form())
    nameIt()
    await create()
    await pick(/Roadmap/)
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    // Opened by hand now: the pick changes the project and sends nothing.
    fireEvent.click(screen.getByRole("button", { name: /Roadmap/ }))
    await pick(/Launch/)
    expect(send).toHaveBeenCalledTimes(1)
    await create()
    expect(send).toHaveBeenCalledTimes(2)
    expect(sentProject()).toBe("p1")
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

describe("the form's shape", () => {
  it("has every row from the start, so picking a project doesn't grow the dialog", () => {
    projects = { data: [project("p1", "Launch"), project("p2", "Roadmap")] }
    render(form())
    expect(screen.getByRole("button", { name: "Pick a project" })).toBeTruthy()
    const someone = screen.getByRole("button", { name: "Pick someone" })
    // Who can have it depends on the project: it waits, and says why.
    expect((someone as HTMLButtonElement).disabled).toBe(true)
    expect(someone.getAttribute("title")).toBe("Pick a project first")
    expect(screen.getByRole("button", { name: /Start date/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Due date/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Labels" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Link a GitHub issue or pull request" })).toBeTruthy()
    // Files wait for it too, and say why in the layer's tip, focusable still.
    const attach = screen.getByRole("button", { name: "Attach a file" })
    expect(attach.getAttribute("aria-disabled")).toBe("true")
    expect(attach.getAttribute("data-disabled-reason")).toBe("Pick a project first")
    expect(attach.getAttribute("title")).toBeNull()
  })
})

// Design v3 (work.md W36): a composer, its properties as chips with keys.
describe("the composer", () => {
  beforeEach(() => {
    projects = { data: [project("p1", "Launch", ["Maya"])] }
  })

  it("has the property chips, each with its key", () => {
    render(form())
    for (const [name, key] of [[/^Status/, "S"], [/^Priority/, "P"], [/^Pick someone|^Assignee/, "A"], [/^Due date/, "D"], [/^Labels/, "L"], [/^Estimate/, "E"]] as const) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-keyshortcuts")).toBe(key)
    }
  })

  it("opens a chip's picker from its key, but not while typing the title", () => {
    render(form())
    fireEvent.keyDown(screen.getByLabelText("Task title"), { key: "p" })
    expect(screen.queryByPlaceholderText("Change priority…")).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: /^Status/ }), { key: "p" })
    expect(screen.getByPlaceholderText("Change priority…")).toBeTruthy()
  })

  it("creates with Cmd or Ctrl and Enter, in the status picked", async () => {
    render(form())
    nameIt()
    await act(async () => void fireEvent.keyDown(screen.getByLabelText("Task title"), { key: "Enter", ctrlKey: true }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(sentPayload().task_status).toBe("todo")
  })

  it("with Create more on, stays open for the next one, chips kept", async () => {
    const onSuccess = vi.fn()
    render(
      <Provider store={store}>
        <TaskCreateForm onSuccess={onSuccess} />
      </Provider>,
    )
    fireEvent.click(screen.getByRole("switch", { name: "Create more" }))
    nameIt()
    await create()
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(onSuccess).not.toHaveBeenCalled()
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("button", { name: /Launch/ })).toBeTruthy()
    expect(await screen.findByRole("status")).toBeTruthy()
  })
})

describe("a link to a new task (/app/create/task?title=…, as Linear's linear.new)", () => {
  const linked = (query: string) => form({ address: placeAddress(query) })
  const created = () => send.mock.calls.map((c) => c[0] as { apiEndpoint: string; payload: Record<string, unknown> })
  beforeEach(() => {
    projects = { data: [{ ...project("p1", "Launch", ["Maya", "Sam"]), project_key: "Q4" }, project("p2", "Roadmap")] }
    statuses = { data: { built_in: [], custom: [{ id: "c1", project_id: "p1", name: "QA", category: "inReview", color: "blue", position: 0 }], colors: [], max: 20 } }
  })

  it("starts with what it names, its project by key and its status by name, and sends that", async () => {
    render(linked("title=Ship+it&description=<b>Line</b>&project=q4&status=qa&priority=urgent&assignee=sam&labels=web,launch&due=2026-11-02&estimate=2h"))
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("Ship it")
    expect(screen.getByRole("button", { name: /Launch/ })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole("button", { name: "Status: QA" })).toBeTruthy())
    expect(screen.getByRole("button", { name: "Priority: Urgent" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Estimate: 2h" })).toBeTruthy()
    await create()
    await waitFor(() => expect(created()).toHaveLength(2))
    const [made, estimate] = created()
    expect(made.payload).toMatchObject({
      task_name: "Ship it",
      task_description: "<p>&lt;b&gt;Line&lt;/b&gt;</p>",
      task_project_uuid: "p1",
      task_status: "c1",
      task_priority: "urgent",
      task_assignee_uuid: "u-Sam",
      task_label: "web, launch",
      task_due_date: new Date(2026, 10, 2).toISOString(),
    })
    expect(estimate.payload).toEqual({ task_uuid: "t1", task_estimate_minutes: 120 })
  })

  it("starts with no project when it names one that isn't the reader's, so Create asks", async () => {
    localStorage.setItem("onecamp:last-task-project", "p2")
    render(linked("title=Ship+it&project=ZZ"))
    await create()
    expect(send).not.toHaveBeenCalled()
    expect(pickerOpen()).toBe(true)
  })

  it("gives the task to whoever opens it, for assignee=me", async () => {
    selfProfile = { data: { user_uuid: "u-Maya" } }
    render(linked("title=Ship+it&project=Q4&assignee=me"))
    await create()
    expect(sentPayload()).toMatchObject({ task_project_uuid: "p1", task_assignee_uuid: "u-Maya", task_status: "todo", task_priority: "medium" })
  })
})

// A phone dims its page under a float that's up (components/ui/floatMark);
// the GitHub link's popover was mounted while shut, so the New task page was
// dim and took no taps (27 Oct).
describe("the form at rest", () => {
  it("marks no float while every picker is shut", () => {
    projects = { data: [project("p1", "Launch")] }
    render(form())
    expect(document.documentElement.hasAttribute("data-float")).toBe(false)
  })
})

describe("a task made with no network (lib/offline)", () => {
  beforeEach(() => {
    projects = { data: [project("p1", "Launch")] }
  })
  const made = async (taskUUID: string) => {
    send.mockResolvedValue({ task_uuid: taskUUID })
    const onCreated = vi.fn()
    render(
      <Provider store={store}>
        <TaskCreateForm defaultProjectId="p1" onCreated={onCreated} />
      </Provider>,
    )
    nameIt("Book the venue")
    await create()
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const row = lists.create.mock.calls[0]?.[0] as { task_uuid: string; task_name: string; task_project: { project_uuid: string } }
    return { onCreated, row }
  }

  it("shows its own row at once, as it sends it", async () => {
    const { row } = await made("t1")
    expect(row).toMatchObject({ task_name: "Book the venue", task_project: { project_uuid: "p1" }, task_status: "todo" })
    expect(row.task_uuid).toMatch(/^temp-/)
  })

  it("takes its own row off when the device keeps it (the lists show it under the id it waits under), and replies under no message", async () => {
    const { onCreated, row } = await made("offline-0d1f2e3c-4b5a-4f6e-8d7c-6b5a4f3e2d1c")
    await waitFor(() => expect(lists.remove).toHaveBeenCalledWith(row.task_uuid, "p1"))
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("keeps its row for the lists to read again when the server made it, and says so to its caller", async () => {
    const { onCreated } = await made("t1")
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ taskUUID: "t1", name: "Book the venue" }))
    expect(lists.remove).not.toHaveBeenCalled()
  })
})
