import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

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
// The picked project's task templates, types and fields (lib/work/taskTemplates), when a test gives them.
let templateList: { data: { templates: { id: string; name: string; project_id?: string }[]; defaults: Record<string, string>; can_manage: boolean } } | undefined
let typeList: { data: { id: string; builtin?: string; name: string; icon: string }[] } | undefined
let fieldList: { data: { fields: { id: string; name: string; type: string; options: [] }[]; can_edit: boolean } } | undefined
const routed = (key: string) =>
  key.endsWith("/statuses") ? statuses : key.endsWith("/task-templates") ? templateList : key.endsWith("/types") ? typeList : key.endsWith("/fields") ? fieldList : key ? projects : undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: routed(key), isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: selfProfile }),
}))
// The project's types as the template pieces read its Task type for a default (components/task/taskTemplateParts).
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: async (url: string) => ({ data: routed(url) }) } }))
// A template read in full, and a task made from one (lib/work/taskTemplatesApi).
const tpl = vi.hoisted(() => ({ get: vi.fn(), make: vi.fn() }))
vi.mock("@/lib/work/taskTemplatesApi", () => ({
  taskTemplatesPath: (p?: string) => (p ? `/project/${p}/task-templates` : "/project/task-templates"),
  getTaskTemplate: tpl.get,
  makeFromTemplate: tpl.make,
}))
// Setting a plain task's type once it exists (lib/work/keysApi), and the toasts that say what failed.
const keys = vi.hoisted(() => ({ setType: vi.fn() }))
vi.mock("@/lib/work/keysApi", async (orig) => ({ ...(await orig<typeof import("@/lib/work/keysApi")>()), setTaskType: keys.setType }))
const toasts = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ toast: toasts.toast, useToast: () => ({ toast: toasts.toast, toasts: [], dismiss: () => {} }) }))
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
// A picker's rows can come with its code (the template pickers are a chunk of their own): wait for the row.
const pick = async (name: RegExp) => {
  const row = await screen.findByRole("option", { name })
  await act(async () => void fireEvent.click(row))
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

describe("a new task from a template (linear-09)", () => {
  const bug = { id: "t1", name: "Bug report", project_id: "p1" }
  const weekly = { id: "t2", name: "Weekly review" }
  const full: Record<string, unknown> = {
    t1: { ...bug, shape: { name: "Bug: ", priority: "high", tags: "bug", due_day: 2, subtasks: [{ name: "Reproduce" }, { name: "Fix" }, { name: "Verify" }] } },
    t2: { ...weekly, shape: { name: "Weekly review", priority: "medium" } },
  }
  const openForm = (props: Record<string, unknown> = {}) =>
    render(
      <Provider store={store}>
        <TaskCreateForm defaultProjectId="p1" {...props} />
      </Provider>,
    )
  const pickTemplate = async (name: string) => {
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /^Template/ })))
    await pick(new RegExp(`^${name}`))
  }
  beforeEach(() => {
    projects = { data: [project("p1", "Website")] }
    templateList = { data: { templates: [bug, weekly], defaults: {}, can_manage: true } }
    typeList = { data: [{ id: "type-task", builtin: "task", name: "Task", icon: "task" }, { id: "type-bug", builtin: "bug", name: "Bug", icon: "bug" }] }
    fieldList = { data: { fields: [{ id: "f1", name: "Customer", type: "text", options: [] }], can_edit: false } }
    tpl.get.mockReset()
    tpl.get.mockImplementation(async (_p: string, id: string) => full[id])
    tpl.make.mockReset()
    tpl.make.mockResolvedValue({ made: { task_id: "n1", subtasks: 3 } })
  })

  it("offers the project's templates, its own first, and fills the form from the one picked", async () => {
    openForm()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Template" })))
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Bug report", "Weekly review"])
    await pick(/^Bug report/)
    expect(tpl.get).toHaveBeenCalledWith("p1", "t1")
    await waitFor(() => expect(screen.getByRole("button", { name: "Template: Bug report" })).toBeTruthy())
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("Bug: ")
    expect(screen.getByRole("button", { name: "Priority: High" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Labels: bug" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Due date: / })).toBeTruthy()
    expect(screen.getByText(/3 sub-tasks/)).toBeTruthy()
  })

  it("makes the task through the template, with what the form shows typed over it", async () => {
    const onSuccess = vi.fn()
    openForm({ onSuccess })
    await pickTemplate("Bug report")
    await waitFor(() => expect(screen.getByRole("button", { name: "Template: Bug report" })).toBeTruthy())
    nameIt("Bug: the login page loops")
    await create()
    expect(send).not.toHaveBeenCalled()
    expect(tpl.make).toHaveBeenCalledWith("p1", "t1", expect.objectContaining({ name: "Bug: the login page loops", priority: "high", tags: "bug" }))
    expect(tpl.make.mock.calls[0][2].due).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("asks for what the template requires in words, keeps the form, and makes it once that is filled", async () => {
    const onSuccess = vi.fn()
    tpl.make.mockResolvedValueOnce({ asks: { missing: ["field:f1"], leftOff: [] } })
    openForm({ onSuccess })
    await pickTemplate("Bug report")
    await waitFor(() => expect(screen.getByRole("button", { name: "Template: Bug report" })).toBeTruthy())
    nameIt("Bug: export drops rows")
    await create()
    const ask = await screen.findByRole("alert")
    expect(ask.textContent).toMatch(/This template asks for/)
    expect(ask.textContent).toMatch(/Customer/)
    expect(onSuccess).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "Acme" } })
    await create()
    // The field reader is its own chunk (lib/tasks/fieldInput), loaded as the answer is read.
    await waitFor(() => expect(tpl.make).toHaveBeenCalledTimes(2))
    expect(tpl.make.mock.calls[1][2]).toMatchObject({ fields: { f1: "Acme" } })
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("starts from the project's default for a new task, and a type picked starts from its own", async () => {
    templateList = { data: { templates: [bug, weekly], defaults: { "type-task": "t2", "type-bug": "t1" }, can_manage: true } }
    openForm()
    await waitFor(() => expect(screen.getByRole("button", { name: "Template: Weekly review" })).toBeTruthy())
    expect((screen.getByLabelText("Task title") as HTMLInputElement).value).toBe("Weekly review")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Type: Task" })))
    await pick(/^Bug/)
    await waitFor(() => expect(screen.getByRole("button", { name: "Template: Bug report" })).toBeTruthy())
    nameIt("Bug: a type picked")
    await create()
    expect(tpl.make).toHaveBeenCalledWith("p1", "t1", expect.objectContaining({ type: "type-bug" }))
  })

  it("makes a plain task when No template is picked", async () => {
    openForm()
    await pickTemplate("Bug report")
    await waitFor(() => expect(screen.getByRole("button", { name: "Template: Bug report" })).toBeTruthy())
    await pickTemplate("No template")
    expect(screen.getByRole("button", { name: "Template" })).toBeTruthy()
    nameIt("Plain one")
    await create()
    expect(tpl.make).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalled()
  })

  it("opens on the template picker when asked (Alt+C on a project's list)", async () => {
    openForm({ pickTemplate: true })
    await waitFor(() => expect(screen.getByRole("option", { name: /^Bug report/ })).toBeTruthy())
  })

  // What's made is what the form shows (CR-172 F1-F3, V-321).
  const incident = { id: "t3", name: "Incident", project_id: "p1" }
  const title = () => (screen.getByLabelText("Task title") as HTMLInputElement).value
  const chosen = (name: string) => waitFor(() => expect(screen.getByRole("button", { name: `Template: ${name}` })).toBeTruthy())
  beforeEach(() => {
    full.t3 = { ...incident, shape: { name: "Incident: ", type: "type-bug" } }
    full.t4 = { id: "t4", name: "Triage", shape: { name: "", assignee: "u-Sam" } }
    keys.setType.mockReset()
    toasts.toast.mockReset()
  })

  it("shows the template's type in the Type chip, and makes the task as that type", async () => {
    templateList = { data: { templates: [bug, weekly, incident], defaults: {}, can_manage: true } }
    openForm()
    await pickTemplate("Incident")
    await waitFor(() => expect(screen.getByRole("button", { name: "Type: Bug" })).toBeTruthy())
    nameIt("Incident: checkout is down")
    await create()
    expect(tpl.make.mock.calls[0][2]).toMatchObject({ type: "type-bug" })
  })

  it("keeps a type picked by hand, and a type a template set never swaps the template for that type's default", async () => {
    templateList = { data: { templates: [bug, weekly, incident], defaults: { "type-task": "t3", "type-bug": "t1" }, can_manage: true } }
    openForm()
    await chosen("Incident")
    await waitFor(() => expect(screen.getByRole("button", { name: "Type: Bug" })).toBeTruthy())
    expect(screen.getByRole("button", { name: "Template: Incident" })).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Type: Bug" })))
    await pick(/^Task/)
    await waitFor(() => expect(screen.getByRole("button", { name: "Type: Task" })).toBeTruthy())
    await pickTemplate("Incident")
    expect(screen.getByRole("button", { name: "Type: Task" })).toBeTruthy()
    nameIt("Incident: a Task by hand")
    await create()
    expect(tpl.make.mock.calls.at(-1)?.[2]).toMatchObject({ type: "type-task" })
  })

  it("says what the project couldn't take beside what the template asks for", async () => {
    tpl.make.mockResolvedValueOnce({ asks: { missing: ["field:f1"], leftOff: ["The value of a field this project doesn't have is left off."] } })
    openForm()
    await pickTemplate("Bug report")
    await chosen("Bug report")
    nameIt("Bug: export drops rows")
    await create()
    expect((await screen.findByRole("alert")).textContent).toMatch(/Customer/)
    expect(screen.getByText("The value of a field this project doesn't have is left off.")).toBeTruthy()
  })

  it("says what the project couldn't take under Created, and stays open until that's read", async () => {
    const onSuccess = vi.fn()
    tpl.make.mockResolvedValue({ made: { task_id: "n1", subtasks: 3, left_off: ['The status "Triage": this project has no such status, so the task starts in its first one.'] } })
    openForm({ onSuccess })
    await pickTemplate("Bug report")
    await chosen("Bug report")
    nameIt("Bug: export drops rows")
    await create()
    await waitFor(() => expect(screen.getByText(/this project has no such status/)).toBeTruthy())
    expect(screen.getByRole("status").textContent).toMatch(/Created/)
    expect(onSuccess).not.toHaveBeenCalled()
    // The next one starts from the template again, so Create doesn't make this one twice.
    expect(title()).toBe("Bug: ")
  })

  it("keeps Created and what was left off on screen past the 3 s a plain Created line lasts", async () => {
    vi.useRealTimers() // the file's pinTestClock mocks the date, and vitest refuses fake timers over a mocked date
    vi.useFakeTimers({ now: TEST_TODAY, shouldAdvanceTime: true })
    try {
      tpl.make.mockResolvedValueOnce({ made: { task_id: "n1", subtasks: 3, left_off: ['The status "Triage": this project has no such status, so the task starts in its first one.'] } })
      openForm()
      await pickTemplate("Bug report")
      await chosen("Bug report")
      nameIt("Bug: export drops rows")
      await create()
      await waitFor(() => expect(screen.getByText(/this project has no such status/)).toBeTruthy())
      await act(async () => void vi.advanceTimersByTime(3100))
      expect(screen.getByText(/this project has no such status/)).toBeTruthy()
      expect(screen.getByRole("status").textContent).toMatch(/Created/)
    } finally {
      vi.useRealTimers()
    }
  })

  it("with Create more on, lets a plain Created line go after 3 s", async () => {
    vi.useRealTimers() // the file's pinTestClock mocks the date, and vitest refuses fake timers over a mocked date
    vi.useFakeTimers({ now: TEST_TODAY, shouldAdvanceTime: true })
    try {
      openForm()
      await pickTemplate("Bug report")
      await chosen("Bug report")
      // Without Create more, a plain make closes the form (onSuccess): its Created line shows only while the form stays.
      await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Create more" })))
      nameIt("Bug: export drops rows")
      await create()
      await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Created/))
      await act(async () => void vi.advanceTimersByTime(3100))
      expect(screen.queryByRole("status")?.textContent ?? "").not.toMatch(/Created/)
    } finally {
      vi.useRealTimers()
    }
  })

  it("with Create more on, starts the next task from the template's title again", async () => {
    openForm()
    await pickTemplate("Bug report")
    await chosen("Bug report")
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Create more" })))
    nameIt("Bug: the first one")
    await create()
    await waitFor(() => expect(tpl.make).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(title()).toBe("Bug: "))
    expect(screen.getByRole("button", { name: "Template: Bug report" })).toBeTruthy()
  })

  it("answers a multi-select the template asks for by ticking its options, and makes it with their ids", async () => {
    fieldList = { data: { fields: [{ id: "f2", name: "Area", type: "multi_select", options: [{ id: "o1", label: "Data loss", color: "red" }, { id: "o2", label: "Billing", color: "sky" }] as never }], can_edit: false } }
    tpl.make.mockResolvedValueOnce({ asks: { missing: ["field:f2"], leftOff: [] } })
    openForm()
    await pickTemplate("Bug report")
    await chosen("Bug report")
    nameIt("Bug: export drops rows")
    await create()
    expect((await screen.findByRole("alert")).textContent).toMatch(/Area/)
    fireEvent.click(await screen.findByRole("button", { name: "Data loss" }))
    await create()
    await waitFor(() => expect(tpl.make).toHaveBeenCalledTimes(2))
    expect(tpl.make.mock.calls[1][2]).toMatchObject({ fields: { f2: ["o1"] } })
  })

  it("never sends an answer given to one template's asks with another template's make", async () => {
    tpl.make.mockResolvedValueOnce({ asks: { missing: ["field:f1"], leftOff: [] } })
    openForm()
    await pickTemplate("Bug report")
    await chosen("Bug report")
    nameIt("Bug: export drops rows")
    await create()
    await screen.findByRole("alert")
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "Acme" } })
    await pickTemplate("Weekly review")
    await chosen("Weekly review")
    await create()
    await waitFor(() => expect(tpl.make).toHaveBeenCalledTimes(2))
    expect(tpl.make.mock.calls[1][1]).toBe("t2")
    expect(tpl.make.mock.calls[1][2].fields ?? {}).toEqual({})
  })

  it("keeps the latest pick when an earlier template reads slower", async () => {
    let release = () => {}
    tpl.get.mockImplementation(async (_p: string, id: string) => {
      if (id === "t1") await new Promise<void>((r) => (release = r))
      return full[id]
    })
    openForm()
    await pickTemplate("Bug report")
    await pickTemplate("Weekly review")
    await chosen("Weekly review")
    await act(async () => release())
    expect(screen.getByRole("button", { name: "Template: Weekly review" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Priority: Medium" })).toBeTruthy()
  })

  it("puts back what the template filled when it's dropped, but keeps what the maker changed", async () => {
    openForm()
    await pickTemplate("Bug report")
    await chosen("Bug report")
    expect(screen.getByRole("button", { name: "Priority: High" })).toBeTruthy()
    nameIt("Bug: mine")
    await pickTemplate("No template")
    expect(screen.getByRole("button", { name: "Priority: Medium" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Labels: bug" })).toBeNull()
    expect(title()).toBe("Bug: mine")
  })

  it("never lets a default template replace what the opener set: My Tasks' yours", async () => {
    projects = { data: [project("p1", "Website", ["Maya", "Sam"])] }
    selfProfile = { data: { user_uuid: "u-Maya" } }
    templateList = { data: { templates: [bug, { id: "t4", name: "Triage", project_id: "p1" }], defaults: { "type-task": "t4" }, can_manage: true } }
    openForm({ assignToMe: true })
    await chosen("Triage")
    await waitFor(() => expect(screen.getByRole("button", { name: /^Assignee: Maya/ })).toBeTruthy())
  })

  it("says so when a plain task's type couldn't be set", async () => {
    keys.setType.mockRejectedValueOnce(new Error("offline"))
    openForm()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Type: Task" })))
    await pick(/^Bug/)
    nameIt("Plain bug")
    await create()
    await waitFor(() => expect(toasts.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: expect.stringMatching(/type/i) })))
  })
})
