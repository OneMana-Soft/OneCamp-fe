import { renders } from "@/lib/testing/reactRenders"
import { Profiler, type ComponentProps, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { SWRConfig, type Cache } from "swr"

import type { TaskInfoInterface } from "@/types/task"
import { TEST_TODAY } from "@/lib/testing/testClock"

// The rows carry dates (task_created_at): every test here reads them on one set clock. It keeps
// ticking from there (pinTestClock's frozen clock holds SWR's dedupe window open, so a list's
// second answer never comes); only Date is faked, timers stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TEST_TODAY, shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
})

// fluid-19: My Tasks and every project's table share one store slot for their rows. Opening a list
// the slot already held (a project opened before), its first commit drew the held rows, its clear
// on mount then took them away (a skeleton commit) and the same answer put them back: the first
// rows drawn twice before the first frame (B49's probe: 1154 renders against 843 with the slot
// empty). A list that finds its own address's first page in the slot now draws it once and keeps
// it; any other list's rows in the slot never draw.

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
// The drag's layer (reorderSlot's useReorderLayer) comes at the page's first idle moment and lends every row its
// grip: one more render of each row, whichever open it lands in. The first open's import of it lands after that
// open stops counting on a loaded machine, and the second open, the module in, takes it at once (a 160-file run:
// held 1775 against empty 1544, all of it TaskRow, Grip and GripVertical, 100 each). Neither open counts it here;
// the slot is what these tests measure (the layer's arrival: listLayerArrives.test.tsx).
vi.mock("@/components/task/listReorder", () => ({ ReorderLayer: () => null }))

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  useSearchParams: () => nav.params,
  usePathname: () => "/app/project/p",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

// One answer object per address, as SWR keeps one. A list's address is its path and whole query.
const answers = vi.hoisted(() => ({ byAddress: {} as Record<string, unknown> }))
vi.mock("@/hooks/useFetch", () => {
  const nothing = { data: undefined, isLoading: false, isError: undefined, mutate: async () => undefined }
  const waiting = { data: undefined, isLoading: true, isError: undefined, mutate: async () => undefined }
  return {
    useFetch: (url: string) => {
      if (!url.startsWith("/project/taskList/") && !url.startsWith("/user/assignedTaskList")) return nothing
      return answers.byAddress[url.replace(/&pageIndex=0$/, "")] ?? waiting
    },
    useFetchOnlyOnce: () => nothing,
    useMediaFetch: () => nothing,
  }
})

const { default: store } = await import("@/store/store")
const { clearTaskListVisibleInfo } = await import("@/store/slice/taskInfoSlice")
const { ProjectTaskTable } = await import("@/components/project/projectTaskTable")
const { MyTaskTable } = await import("@/components/myTask/myTaskTable")
const { useTaskUpdate } = await import("@/hooks/useTaskUpdate")

const STATUSES = ["backlog", "todo", "inProgress", "inReview"]
const task = (list: string, i: number) =>
  ({
    task_uuid: `7a5c00f1-0000-4000-8000-${list}${String(i).padStart(11, "0")}`,
    task_name: `${list} task ${i}`,
    task_status: STATUSES[i % 4],
    task_priority: "medium",
    task_label: "",
    task_due_date: "",
    task_start_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_sub_task_count: 0,
    task_comment_count: 0,
    task_project: { project_uuid: "p", project_name: "Q4 launch", project_is_admin: true },
  }) as unknown as TaskInfoInterface

const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", manage: true, manage_people: true, archive: true }
const read = (data: unknown) => ({ data, isLoading: false, isError: undefined, mutate: async () => undefined })
const projectAnswer = (id: string, tasks: TaskInfoInterface[]) =>
  read({ msg: "ok", pageCount: 1, data: { project_uuid: id, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_access: admin, project_tasks: tasks } })
const mineAnswer = (tasks: TaskInfoInterface[]) => read({ msg: "ok", pageCount: 1, data: { user_tasks: tasks } })

const PROJECT_P = "/project/taskList/p?"
const MINE = "/user/assignedTaskList?"

// SWR's cache as a view of the answers above, each under the url useFetch reads it by, so the real
// useTaskUpdate patches what the tables read: a list patched, deleted or moved while its table is away.
const others = new Map<string, unknown>()
const addressIn = (key: string) => (key.endsWith("&pageIndex=0") && key.slice(0, -12) in answers.byAddress ? key.slice(0, -12) : undefined)
const swrCache = {
  get: (key: string) => {
    const at = addressIn(key)
    return at === undefined ? others.get(key) : { data: (answers.byAddress[at] as { data: unknown }).data }
  },
  set: (key: string, value: { data?: unknown }) => {
    const at = addressIn(key)
    if (at === undefined) others.set(key, value)
    else answers.byAddress[at] = read(value.data)
  },
  delete: (key: string) => {
    const at = addressIn(key)
    if (at === undefined) others.delete(key)
    else delete answers.byAddress[at]
  },
  keys: () => [...Object.keys(answers.byAddress).map((at) => `${at}&pageIndex=0`), ...others.keys()][Symbol.iterator](),
}
const SWR = { provider: () => swrCache as unknown as Cache }

/** Each commit's rows in the page, counted as it commits (and, given `ids`, each commit's task ids). */
function mount(node: ReactNode, commits: number[], ids?: string[][]) {
  const onRender = () => {
    const rows = [...document.querySelectorAll("[data-task-id]")]
    commits.push(rows.length)
    ids?.push(rows.map((r) => r.getAttribute("data-task-id")!))
  }
  const wrap = (n: ReactNode) => (
    <Provider store={store}>
      <SWRConfig value={SWR}>
        <Profiler id="list" onRender={onRender}>
          {n}
        </Profiler>
      </SWRConfig>
    </Provider>
  )
  const view = render(wrap(node))
  /** Renders the tree again from a new element (a parent's render), so the readers read again. */
  return { again: (n: ReactNode) => view.rerender(wrap(n)) }
}
// Waits until nothing moves: no render, no row drawn and no row put in the slot across two 50 ms
// ticks (at most 3 s). One fixed 50 ms wait ended before the reads it waited for on a loaded
// machine (a 160-file run took 6 of these 9 tests down; alone they passed).
const quiet = () => `${renders.count}|${document.querySelectorAll("[data-task-id]").length}|${store.getState().TaskInfo.taskListVisibleInfo.length}`
const settle = () =>
  act(async () => {
    let last = quiet()
    for (let still = 0, i = 0; still < 2 && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 50))
      const now = quiet()
      still = now === last ? still + 1 : 0
      last = now
    }
  })
vi.setConfig({ testTimeout: 20_000 })

// Learns a table's address: mount once with nothing answered, note what it asked.
const addressOf = async (node: ReactNode, prefix: string) => {
  const seen = new Set<string>()
  const was = answers.byAddress
  answers.byAddress = new Proxy(was, { get: (o, k: string) => (k.startsWith(prefix) && seen.add(k), o[k]) })
  mount(node, [])
  await settle()
  cleanup()
  answers.byAddress = was
  return [...seen].at(-1)!
}

afterEach(() => {
  cleanup()
  drawn.names = []
  nav.params = new URLSearchParams()
  answers.byAddress = {}
  others.clear()
  store.dispatch(clearTaskListVisibleInfo())
})

const P = Array.from({ length: 100 }, (_, i) => task("p", i))
const Q = Array.from({ length: 100 }, (_, i) => task("q", i))
const M = Array.from({ length: 100 }, (_, i) => task("m", i))

/** Opens a list with the slot empty, then again with the slot holding what the first open put in. */
async function emptyThenHeld(node: () => ReactNode) {
  const empty: number[] = []
  renders.reset()
  mount(node(), empty)
  await settle()
  const emptyRenders = renders.count
  const emptyDrawn = drawn.names.length
  cleanup()
  drawn.names = []

  const held: number[] = []
  renders.reset()
  mount(node(), held)
  await settle()
  return { empty, held, emptyRenders, emptyDrawn, heldRenders: renders.count, heldDrawn: [...drawn.names] }
}

describe("a task table opening on the rows the slot already holds (fluid-19)", () => {
  it.each([
    ["a project's", () => <ProjectTaskTable projectId="p" />, PROJECT_P, () => projectAnswer("p", P)],
    ["My Tasks'", () => <MyTaskTable />, MINE, () => mineAnswer(M)],
  ])("%s: its own first page in the slot draws at the first commit, once, and stays (no skeleton, no second draw)", async (_, node, prefix, answer) => {
    answers.byAddress[(await addressOf(node(), prefix))] = answer()
    const r = await emptyThenHeld(node)
    // The first open: a skeleton until the answer reaches the slot, then the rows.
    expect(r.empty[0]).toBe(0)
    // The second: the rows at the first commit, and never a commit without them.
    expect(r.held[0]).toBe(30)
    expect(r.held.filter((n) => n === 0)).toEqual([])
    // Each row drawn once, and no more drawing than opening it with the slot empty.
    expect(new Set(r.heldDrawn).size).toBe(r.heldDrawn.length)
    expect(r.heldDrawn.length).toBeLessThanOrEqual(r.emptyDrawn)
    expect(r.heldRenders, `held ${r.heldRenders}, empty ${r.emptyRenders}: ${renders.top()}`).toBeLessThanOrEqual(r.emptyRenders)
  })

  it("a new answer for the same address (SWR's revalidation) still replaces the kept rows", async () => {
    const node = () => <ProjectTaskTable projectId="p" />
    const at = await addressOf(node(), PROJECT_P)
    answers.byAddress[at] = projectAnswer("p", P)
    mount(node(), [])
    await settle()
    cleanup()
    const view = mount(node(), [])
    await settle()
    answers.byAddress[at] = projectAnswer("p", [{ ...P[0], task_name: "p task 0, renamed" } as TaskInfoInterface, ...P.slice(1)])
    view.again(node())
    await settle()
    expect(store.getState().TaskInfo.taskListVisibleInfo.map((t) => t.task_name)).toEqual(["p task 0, renamed", ...P.slice(1).map((t) => t.task_name)])
  })
})

describe("a task table opening on another list's rows in the slot (fluid-19)", () => {
  // The slot holds project p's first page (p opened, then left).
  const holdP = async () => {
    const node = () => <ProjectTaskTable projectId="p" />
    answers.byAddress[(await addressOf(node(), PROJECT_P))] = projectAnswer("p", P)
    mount(node(), [])
    await settle()
    expect(store.getState().TaskInfo.taskListVisibleInfo.length).toBe(100)
    cleanup()
    drawn.names = []
  }
  const noneOfP = () => drawn.names.filter((n) => n.startsWith("p task"))

  it.each([
    ["another project", () => <ProjectTaskTable projectId="q" />, "/project/taskList/q?", () => projectAnswer("q", Q)],
    ["My Tasks", () => <MyTaskTable />, MINE, () => mineAnswer(M)],
  ])("%s never draws them, not even at its first commit, and draws its own once they come", async (_, node, prefix, answer) => {
    const at = await addressOf(node(), prefix)
    await holdP()
    const commits: number[] = []
    const view = mount(node(), commits)
    await settle()
    expect(commits.filter((n) => n > 0)).toEqual([])
    expect(noneOfP()).toEqual([])
    answers.byAddress[at] = answer()
    view.again(node())
    await settle()
    expect(noneOfP()).toEqual([])
    expect(drawn.names.length).toBeGreaterThan(0)
  })

  it("the same project under another sort is another address: its first commit draws none of the held rows", async () => {
    await holdP()
    nav.params = new URLSearchParams({ sort: JSON.stringify([{ id: "task_name", desc: true }]) })
    const commits: number[] = []
    mount(<ProjectTaskTable projectId="p" />, commits)
    await settle()
    expect(commits.filter((n) => n > 0)).toEqual([])
    expect(noneOfP()).toEqual([])
  })
})

describe("a list patched while its table is away is not kept: no commit draws a stale row (CR-428 F1)", () => {
  const node = () => <ProjectTaskTable projectId="p" />
  type Update = ReturnType<typeof useTaskUpdate>
  const tasksAt = (at: string) => (answers.byAddress[at] as { data: { data: { project_tasks: TaskInfoInterface[] } } }).data.data.project_tasks
  const commitsWith = (ids: string[][], id: string) => ids.filter((c) => c.includes(id)).length

  /** Opens p, leaves it, patches the lists through useTaskUpdate with no table mounted, opens p again recording each commit's ids. */
  async function patchedWhileAway(patch: (u: Update) => void) {
    mount(node(), [])
    await settle()
    cleanup()
    let update: Update | undefined
    function Patcher() {
      update = useTaskUpdate()
      return null
    }
    mount(<Patcher />, [])
    await act(async () => patch(update!))
    await settle()
    cleanup()
    drawn.names = []
    const commits: number[] = []
    const ids: string[][] = []
    mount(node(), commits, ids)
    await settle()
    return { commits, ids }
  }

  it("a task renamed and another deleted while away: no commit draws the deleted task or the old name", async () => {
    const at = await addressOf(node(), PROJECT_P)
    answers.byAddress[at] = projectAnswer("p", P)
    const { ids } = await patchedWhileAway((u) => {
      u.optimisticUpdateTasks([{ task_uuid: P[0].task_uuid, task_name: "p task 0, renamed" }], "p")
      u.optimisticDeleteTask(P[4].task_uuid, "p")
    })
    // The patches reached the answer the table reads (as SWR's cache holds it).
    expect(tasksAt(at).map((t) => t.task_name).slice(0, 5)).toEqual(["p task 0, renamed", "p task 1", "p task 2", "p task 3", "p task 5"])
    expect(commitsWith(ids, P[4].task_uuid), "commits drawing the task deleted while away").toBe(0)
    expect(drawn.names.filter((n) => n === "p task 0"), "draws of the name from before the rename").toEqual([])
    expect(drawn.names).toContain("p task 0, renamed")
    expect(store.getState().TaskInfo.taskListVisibleInfo.map((t) => t.task_uuid)).toEqual(P.filter((_, i) => i !== 4).map((t) => t.task_uuid))
  })

  it("a task moved out of a status-filtered list while away never draws", async () => {
    nav.params = new URLSearchParams({ status: "todo" })
    const at = await addressOf(node(), PROJECT_P)
    const todo = P.filter((t) => t.task_status === "todo")
    answers.byAddress[at] = projectAnswer("p", todo)
    const { ids } = await patchedWhileAway((u) => u.optimisticUpdateTask({ task_uuid: todo[1].task_uuid, task_status: "done" }, "p"))
    expect(tasksAt(at).map((t) => t.task_uuid)).not.toContain(todo[1].task_uuid)
    expect(commitsWith(ids, todo[1].task_uuid), "commits drawing the task moved out while away").toBe(0)
    expect(drawn.names).not.toContain(todo[1].task_name)
  })

  it("a patch to another project's list while away keeps this one: its first commit draws the held rows, never 0 after", async () => {
    const q = await addressOf(<ProjectTaskTable projectId="q" />, "/project/taskList/q?")
    answers.byAddress[q] = projectAnswer("q", Q)
    const at = await addressOf(node(), PROJECT_P)
    answers.byAddress[at] = projectAnswer("p", P)
    const { commits } = await patchedWhileAway((u) => u.optimisticUpdateTasks([{ task_uuid: Q[0].task_uuid, task_name: "q task 0, renamed" }], "q"))
    expect(tasksAt(q)[0].task_name).toBe("q task 0, renamed")
    expect(commits[0]).toBe(30)
    expect(commits.filter((n) => n === 0)).toEqual([])
  })
})
