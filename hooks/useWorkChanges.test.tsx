import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import useSWR, { SWRConfig } from "swr"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { useWorkChanges } from "@/hooks/useWorkChanges"
import { projectFieldsKey } from "@/hooks/useProjectFields"
import { pinTestClock } from "@/lib/testing/testClock"
import { workloadKey } from "@/lib/workloadKey"
import { GetEndpointUrl } from "@/services/endPoints"
import axiosInstance from "@/lib/axiosInstance"

// A teammate's change heard while an open view is still reading (projects
// WCL-2b; ROWS asana-19, jira-19). SWR throws away a read that a later patch
// overlaps, and reads again only after a patch that revalidates, which the
// live feed's patches never do. On the demo, a teammate's new task was read
// again on its task.created; its task.updated, 55 ms later, patched the lists
// while that read was out, and the board never drew the task until a reload.

afterEach(cleanup)
// A catch-up reads on from a kept place (the member's Offline Store, not in a unit test).
vi.mock("@/lib/offline/workCursor", () => ({ readWorkCursor: async () => "c1", keepWorkCursor: async () => undefined }))
// The tasks carry a due date, so they read it on the pinned clock, not the machine's.
pinTestClock()

const P = "p1"
const BOARD = `${GetEndpointUrl.GetProjectTaskListForKanban}/${P}`
const WORKLOAD = workloadKey("UTC")
const PANEL = `${GetEndpointUrl.GetTaskInfo}/a`
const DUE = "2026-11-02T17:00:00Z"

interface Task {
  task_uuid: string
  task_name: string
  task_due_date?: string
  task_priority?: string
  task_fields?: Record<string, number>
}

interface Reads<T> {
  count: number
  read: () => Promise<T>
  answer: () => void
}

/** Reads that answer only when the test says, with what the server holds by then. */
function heldReads<T>(answer: () => T): Reads<T> {
  const out: (() => void)[] = []
  const reads: Reads<T> = {
    count: 0,
    read: () =>
      new Promise<T>((resolve) => {
        reads.count++
        out.push(() => resolve(answer()))
      }),
    answer: () => out.splice(0).forEach((send) => send()),
  }
  return reads
}

/** The project's tasks as the server holds them, and the app's reads of the board, the workload and task a's panel. */
interface Server {
  tasks: Task[]
  board: Reads<{ data: { project_tasks_todo: Task[] } }>
  workload: Reads<{ data: { people: never[]; undated: never[]; tasks: Task[] } }>
  panel: Reads<{ data: Partial<Task> }>
}

function teammateServer(): Server {
  const server: Server = {
    tasks: [{ task_uuid: "a", task_name: "Draft launch email", task_due_date: DUE }],
    board: heldReads(() => ({ data: { project_tasks_todo: server.tasks.map((t) => ({ ...t })) } })),
    workload: heldReads(() => ({ data: { people: [], undated: [], tasks: server.tasks.map((t) => ({ ...t })) } })),
    panel: heldReads(() => ({ data: { ...server.tasks.find((t) => t.task_uuid === "a") } })),
  }
  return server
}


/** The views open in one app (the app's cache, and its bridge for the panel's patches), with the feed live; `fields`, the project's fields as read. */
function openViews(server: Server, views: { panel?: boolean; fields?: { id: string; name: string; type: string }[] } = {}) {
  const cache = new Map()
  if (views.fields) cache.set(projectFieldsKey(P), { data: { data: { fields: views.fields } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }}>
      <SWRMutateBridge />
      {children}
    </SWRConfig>
  )
  // Each view reads its data as it renders: SWR renders again only for what was read.
  return renderHook(
    () => ({
      live: useWorkChanges(),
      board: useSWR(BOARD, server.board.read).data,
      workload: useSWR(WORKLOAD, server.workload.read).data,
      panel: useSWR(views.panel ? PANEL : null, server.panel.read).data,
    }),
    { wrapper },
  ).result
}

/** A Task_Changed message's data, as the server sends it on the project's topic. */
const heard = (sequence: number, kind: string, task: string, diff?: Record<string, unknown>) => ({ project_uuid: P, task_uuid: task, sequence, kind, diff, by: "teammate" })

type Views = ReturnType<typeof openViews>
const onBoard = (views: Views) => views.current.board?.data.project_tasks_todo.map((t) => t.task_name)
const inWorkload = (views: Views) => views.current.workload?.data.tasks.map((t) => t.task_name)

/** The views' first reads out, then answered: they show a's name `name`. */
async function settled(server: Server, views: Views, name: string) {
  await waitFor(() => expect([server.board.count, server.workload.count]).toEqual([1, 1]))
  await act(async () => {
    server.board.answer()
    server.workload.answer()
  })
  await waitFor(() => expect(onBoard(views)).toEqual([name]))
  await waitFor(() => expect(inWorkload(views)).toEqual([name]))
}

describe("a teammate's change heard while an open view is still reading (WCL-2b)", () => {
  it("a task made while the board is open draws, though its next change was patched in while the board read it", async () => {
    const server = teammateServer()
    const views = openViews(server)
    await settled(server, views, "Draft launch email")
    expect([server.board.count, server.workload.count]).toEqual([1, 1])

    // The teammate makes x: the board and the workload read the project's tasks again, and those reads are out.
    server.tasks = [...server.tasks, { task_uuid: "x", task_name: "Book the venue", task_due_date: DUE }]
    act(() => views.current.live.onTaskChanged(heard(2, "task.created", "x")))
    await waitFor(() => expect([server.board.count, server.workload.count]).toEqual([2, 2]))

    // While they are out, x's fields change (its task.updated, as on the demo) and so does a's name: both are patched in.
    server.tasks = [
      { ...server.tasks[0], task_name: "Send launch email" },
      { ...server.tasks[1], task_priority: "high" },
    ]
    act(() => {
      views.current.live.onTaskChanged(heard(3, "task.updated", "x", { task_priority: "high" }))
      views.current.live.onTaskChanged(heard(4, "task.updated", "a", { task_name: "Send launch email" }))
    })
    await waitFor(() => expect(onBoard(views)).toEqual(["Send launch email"]))
    await waitFor(() => expect(inWorkload(views)).toEqual(["Send launch email"]))

    // The server answers: the task the teammate made shows on the board and in the workload, with its change.
    await act(async () => {
      server.board.answer()
      server.workload.answer()
    })
    await waitFor(() => expect(onBoard(views), "the new task draws on the open board").toEqual(["Send launch email", "Book the venue"]))
    await waitFor(() => expect(inWorkload(views), "and in the open workload").toEqual(["Send launch email", "Book the venue"]))
    expect(views.current.board?.data.project_tasks_todo[1].task_priority).toBe("high")
  })

  it("a task's panel still opening takes a teammate's change to it, then shows the task", async () => {
    const server = teammateServer()
    const views = openViews(server, { panel: true })
    await settled(server, views, "Draft launch email")
    await waitFor(() => expect(server.panel.count, "the panel's first read is out").toBe(1))

    server.tasks = [{ ...server.tasks[0], task_name: "Send launch email" }]
    act(() => views.current.live.onTaskChanged(heard(2, "task.updated", "a", { task_name: "Send launch email" })))
    await waitFor(() => expect(onBoard(views)).toEqual(["Send launch email"]))

    await act(async () => server.panel.answer())
    await waitFor(() => expect(views.current.panel?.data.task_name, "the panel shows the task").toBe("Send launch email"))
  })

  it("views not reading take a teammate's change in place, with no read", async () => {
    const server = teammateServer()
    const views = openViews(server, { panel: true })
    await settled(server, views, "Draft launch email")
    await act(async () => server.panel.answer())
    await waitFor(() => expect(views.current.panel?.data.task_name).toBe("Draft launch email"))
    const reads = () => [server.board.count, server.workload.count, server.panel.count]
    expect(reads()).toEqual([1, 1, 1])

    act(() => views.current.live.onTaskChanged(heard(2, "task.updated", "a", { task_name: "Send launch email", task_priority: "high" })))
    await waitFor(() => expect(onBoard(views)).toEqual(["Send launch email"]))
    await waitFor(() => expect(inWorkload(views)).toEqual(["Send launch email"]))
    await waitFor(() => expect(views.current.panel?.data.task_name).toBe("Send launch email"))
    await act(() => new Promise((done) => setTimeout(done, 50)))
    expect(reads(), "patched in place: nothing is read again").toEqual([1, 1, 1])
  })
})

// V-698: a money field's value is for the project's admins only, so its change comes to every member alike with no
// value (refetch: true) and each app reads the task again as itself. Applied as a value, it wrote null: every admin's
// open board and panel lost the amount until a reload.
describe("a teammate's change of a field told with no value (a money field's, V-698)", () => {
  const BUDGET = "f-budget"
  const budgetOnBoard = (views: Views) => views.current.board?.data.project_tasks_todo[0]?.task_fields?.[BUDGET]

  it("keeps the open board's and panel's value, reads both again, and shows what the server answers", async () => {
    const server = teammateServer()
    server.tasks = [{ ...server.tasks[0], task_fields: { [BUDGET]: 120000 } }]
    const views = openViews(server, { panel: true })
    await settled(server, views, "Draft launch email")
    await act(async () => server.panel.answer())
    await waitFor(() => expect(views.current.panel?.data.task_fields?.[BUDGET]).toBe(120000))
    expect([server.board.count, server.workload.count, server.panel.count]).toEqual([1, 1, 1])

    server.tasks = [{ ...server.tasks[0], task_fields: { [BUDGET]: 150000 } }]
    act(() => views.current.live.onTaskChanged(heard(2, "task.updated", "a", { field_id: BUDGET, refetch: true })))
    await waitFor(() => expect([server.board.count, server.panel.count], "the board and the panel read the task again").toEqual([2, 2]))
    expect(budgetOnBoard(views), "the board's cell keeps its amount while it reads").toBe(120000)
    expect(views.current.panel?.data.task_fields?.[BUDGET], "and so does the panel's").toBe(120000)

    await act(async () => {
      server.board.answer()
      server.workload.answer()
      server.panel.answer()
    })
    await waitFor(() => expect(budgetOnBoard(views), "the board shows the amount the server answers").toBe(150000))
    await waitFor(() => expect(views.current.panel?.data.task_fields?.[BUDGET]).toBe(150000))
  })
})

// V-762: a task's built-ins (its dates, status, priority, estimate, points) come with no formula's new value, so in a
// project with a formula field each app reads the task again as itself; with none, the change stays a patch in place.
describe("a teammate's change of a task's built-ins in a project with a formula field (V-762)", () => {
  const FORMULA = [{ id: "f-days-left", name: "Days left", type: "formula" }]
  const NUMBER = [{ id: "f-points", name: "Points", type: "number" }]
  const LATER = "2026-11-09T17:00:00Z"

  /** The views open and settled, the panel's first read answered: no read is out. */
  async function settledWithPanel(fields: { id: string; name: string; type: string }[]) {
    const server = teammateServer()
    const views = openViews(server, { panel: true, fields })
    await settled(server, views, "Draft launch email")
    await act(async () => server.panel.answer())
    await waitFor(() => expect(views.current.panel?.data.task_name).toBe("Draft launch email"))
    expect([server.board.count, server.panel.count]).toEqual([1, 1])
    return { server, views }
  }

  it("a due date changed reads the task again: the panel and the board", async () => {
    const { server, views } = await settledWithPanel(FORMULA)
    server.tasks = [{ ...server.tasks[0], task_due_date: LATER }]
    act(() => views.current.live.onTaskChanged(heard(2, "task.updated", "a", { task_due_date: LATER })))
    await waitFor(() => expect([server.board.count, server.panel.count], "the board and the panel read the task again").toEqual([2, 2]))
    await act(async () => {
      server.board.answer()
      server.workload.answer()
      server.panel.answer()
    })
    await waitFor(() => expect(views.current.panel?.data.task_due_date).toBe(LATER))
  })

  it("a task moved to another status reads it again too", async () => {
    const { server, views } = await settledWithPanel(FORMULA)
    act(() => views.current.live.onTaskChanged(heard(2, "task.updated", "a", { task_status: "in_progress" })))
    await waitFor(() => expect([server.board.count, server.panel.count], "the board and the panel read the task again").toEqual([2, 2]))
  })

  it("with no formula field, the same change is patched in place, with no read", async () => {
    const { server, views } = await settledWithPanel(NUMBER)
    act(() => views.current.live.onTaskChanged(heard(2, "task.updated", "a", { task_due_date: LATER })))
    await waitFor(() => expect(views.current.panel?.data.task_due_date).toBe(LATER))
    await act(() => new Promise((done) => setTimeout(done, 50)))
    expect([server.board.count, server.panel.count], "patched in place: nothing is read again").toEqual([1, 1])
  })
})

// V-762 for a catch-up (CR-B55 F1): one page of the log is ONE lot, and lib/tasks/workChanges reads each project, and
// each task's panel, again at most once for it. A built-in change still reads its task again where a formula may read
// it, but once for the lot, after its patches: never once per change (a page is up to 500 entries, and each read of a
// board makes the server work out every formula on it).
describe("a catch-up's lot of built-in changes in a project with a formula field (V-762, CR-B55 F1)", () => {
  const FORMULA = [{ id: "f-days-left", name: "Days left", type: "formula" }]
  const NUMBER = [{ id: "f-points", name: "Points", type: "number" }]
  const LATER = "2026-11-09T17:00:00Z"
  const NAMES = ["Draft launch email", "Book the venue", "Print the flyers"]
  const change = (sequence: number, task: string, diff: Record<string, unknown>) => ({ sequence, kind: "task.updated", resource_kind: "task", resource_uuid: task, project_uuid: P, diff })

  afterEach(() => vi.restoreAllMocks())

  /** Three dated tasks on the board and in the workload, a's panel open, every first read answered; then one page of `diffs`, one per task. */
  async function lotOfThree(fields: { id: string; name: string; type: string }[], diff: Record<string, unknown>) {
    const page = ["a", "b", "c"].map((task, i) => change(i + 2, task, diff))
    vi.spyOn(axiosInstance, "get").mockImplementation((async () => ({ data: { data: { entries: page, cursor: "c2" } } })) as never)
    const server = teammateServer()
    server.tasks = ["a", "b", "c"].map((task, i) => ({ task_uuid: task, task_name: NAMES[i], task_due_date: DUE }))
    const views = openViews(server, { panel: true, fields })
    await waitFor(() => expect([server.board.count, server.workload.count, server.panel.count]).toEqual([1, 1, 1]))
    await act(async () => {
      server.board.answer()
      server.workload.answer()
      server.panel.answer()
    })
    await waitFor(() => expect(onBoard(views)).toEqual(NAMES))
    await waitFor(() => expect(inWorkload(views)).toEqual(NAMES))
    act(() => views.current.live.catchUp())
    await act(() => new Promise((done) => setTimeout(done, 100)))
    return server
  }
  const reads = (server: Server) => [server.board.count, server.workload.count, server.panel.count]

  it("three due dates changed: the board, the workload and a's panel are each read again once", async () => {
    const server = await lotOfThree(FORMULA, { task_due_date: LATER })
    expect(reads(server), "[board, workload, panel] after one lot of 3 (1 = the first read)").toEqual([2, 2, 2])
  })

  it("three tasks moved to another status: read again once too", async () => {
    const server = await lotOfThree(FORMULA, { task_status: "in_progress" })
    expect(reads(server), "[board, workload, panel] after one lot of 3 (1 = the first read)").toEqual([2, 2, 2])
  })

  it("with no formula field, the lot is patched in place, with no read", async () => {
    const server = await lotOfThree(NUMBER, { task_due_date: LATER })
    expect(reads(server)).toEqual([1, 1, 1])
  })
})
