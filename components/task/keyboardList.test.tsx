import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import splitSlice from "@/store/slice/splitSlice"
import desktopRightPanelSlice, { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { armGo, disarmGo } from "@/lib/goKeys"
import type { TaskInfoInterface } from "@/types/task"
import { offeredSurfaces, type PaletteEntry } from "@/lib/ui/paletteEntries"
import { projectTagsKey } from "@/hooks/useProjectTags"
import { ProjectsGet } from "@/services/endpoints/projects"
import { milestonesPath } from "@/lib/work/milestones"
// Status names are translated, as in the app (ClientProviders loads this once).
import "@/lib/utils/i18n"

const bulk = vi.fn(async (tasks: TaskInfoInterface[]) => ({ changed: tasks.length, failed: 0, unchanged: 0, done: tasks }))
const toasts: Array<{ title?: string; action?: unknown }> = []
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => (toasts.push(t), { id: "t", dismiss: () => {}, update: () => {} }), useToast: () => ({ toasts: [] }) }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => bulk }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: BUILT_IN_STATUSES }) }))
vi.mock("@/hooks/useProjectTags", async (original) => ({ ...(await original<object>()), useProjectTags: () => ({ tags: [], refresh: () => {} }) }))
// What the palette's pages read as they open (the selection's people, tags and
// milestones), by key: the answers the bar's own pickers would get.
const answers: Record<string, unknown> = {}
const readInto = vi.fn(async (_cache: unknown, key: string) => {
  if (key in answers) return answers[key]
  throw new Error(`nothing read at ${key}`)
})
vi.mock("@/lib/http/readInto", () => ({ readInto }))
// The project's people, tags and milestones, as the server answers each key.
answers[`${ProjectsGet.GetProjectMemberInfo}/p1`] = { data: { project_members: [{ user_uuid: "u-ada", user_name: "Ada" }] } }
answers[projectTagsKey("p1")] = { data: [{ name: "launch", count: 3 }] }
answers[milestonesPath("p1")] = { data: { milestones: [{ id: "m-beta", name: "Beta", target_date: null }] } }
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
// The list loads the task under the pointer or the keys ahead of its opening.
const prefetched: string[] = []
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => (url && prefetched.push(url), { data: undefined }) }))

const { KeyboardList, TaskTableRow, HOVER_INTENT_MS } = await import("./KeyboardList")
const { useRowState } = await import("@/hooks/useListSelection")

// The selection bar is a chunk of its own (next/dynamic in KeyboardList), and
// its pickers are a large module graph. Loaded first here, its transform has
// a hook's 10 s rather than findBy's 1 s: in a full parallel run on a busy
// machine it once took longer than that, and the bar's first test failed.
// The tests still wait for the bar to arrive through the dynamic import.
beforeAll(async () => {
  await import("@/components/task/BulkTaskBar")
})

/** A card as a board draws one, reduced to what the keys need. */
function Card({ t }: { t: TaskInfoInterface }) {
  const { highlighted } = useRowState(t.task_uuid)
  return (
    <div data-task-id={t.task_uuid} tabIndex={0} data-highlighted={highlighted || undefined}>
      {t.task_name}
    </div>
  )
}

const task = (id: string, name: string) => ({ task_uuid: id, task_name: name, task_status: "todo", task_priority: "low", task_label: "" }) as TaskInfoInterface
const TASKS = [task("t1", "Write the copy"), task("t2", "Pick the hero"), task("t3", "Book the retro")]

function renderList(canEdit: (t: TaskInfoInterface) => boolean = () => true) {
  const store = configureStore({ reducer: { split: splitSlice.reducer, rightPanel: desktopRightPanelSlice.reducer } })
  render(
    <Provider store={store}>
      <div data-split-view="-1">
        <KeyboardList tasks={TASKS} canEdit={canEdit} listProjectId="p1" statusOptions={BUILT_IN_STATUSES}>
          <table>
            <tbody>
              {TASKS.map((t) => (
                <TaskTableRow key={t.task_uuid} id={t.task_uuid}>
                  <td>{t.task_name}</td>
                </TaskTableRow>
              ))}
            </tbody>
          </table>
          <input aria-label="Search" />
        </KeyboardList>
      </div>
    </Provider>,
  )
  return store
}

const press = (key: string, extra: Record<string, unknown> = {}) => act(() => void fireEvent.keyDown(document.activeElement ?? document.body, { key, ...extra }))
const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement

beforeEach(() => {
  bulk.mockClear()
  readInto.mockClear()
  toasts.length = 0
})
afterEach(() => {
  cleanup()
  disarmGo()
})

describe("a task list from the keyboard", () => {
  it("moves with J and K, selects with X and Shift, and changes the status of the selection", async () => {
    const store = renderList()
    press("j")
    expect(row("Write the copy")).toHaveAttribute("data-highlighted")
    press("j")
    expect(row("Pick the hero")).toHaveAttribute("data-highlighted")
    expect(row("Write the copy")).not.toHaveAttribute("data-highlighted")
    press("x")
    expect(row("Pick the hero")).toHaveAttribute("data-state", "selected")
    // The bar is a chunk of its own (KeyboardList): it arrives a moment after the list.
    expect(await screen.findByRole("toolbar", { name: "1 task selected" })).toBeInTheDocument()
    press("K", { shiftKey: true })
    expect(row("Write the copy")).toHaveAttribute("data-state", "selected")
    expect(screen.getByRole("toolbar", { name: "2 tasks selected" })).toBeInTheDocument()

    press("s")
    const search = await screen.findByPlaceholderText("Move to…")
    expect(search).toBeInTheDocument()
    fireEvent.click(screen.getByText("Done"))
    await act(async () => {})
    expect(bulk).toHaveBeenCalledOnce()
    const [tasks, change] = bulk.mock.calls[0] as unknown as [TaskInfoInterface[], { field: string; value: string }]
    expect(tasks.map((t) => t.task_uuid).sort()).toEqual(["t1", "t2"])
    expect(change).toMatchObject({ field: "status", value: "done" })

    press("Escape")
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(store.getState().rightPanel.rightPanelState.isOpen).toBe(false)
  })

  it("sets the selection's due date with D (PTC-20)", async () => {
    renderList()
    press("j")
    press("x")
    press("j")
    press("x")
    expect(await screen.findByRole("toolbar", { name: "2 tasks selected" })).toBeInTheDocument()
    press("d")
    fireEvent.click(await screen.findByRole("button", { name: "Tomorrow" }))
    await act(async () => {})
    expect(bulk).toHaveBeenCalledOnce()
    const [tasks, change] = bulk.mock.calls[0] as unknown as [TaskInfoInterface[], { field: string; value: string }]
    expect(tasks.map((t) => t.task_uuid).sort()).toEqual(["t1", "t2"])
    const tomorrow = new Date()
    tomorrow.setHours(0, 0, 0, 0)
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(change).toEqual({ field: "due", value: tomorrow.toISOString() })
  })

  it("deletes the selection with Undo, and clears it (PTC-20)", async () => {
    renderList()
    press("j")
    press("x")
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }))
    await act(async () => {})
    const [tasks, change] = bulk.mock.calls[0] as unknown as [TaskInfoInterface[], { field: string }]
    expect(tasks.map((t) => t.task_uuid)).toEqual(["t1"])
    expect(change).toEqual({ field: "delete" })
    expect(toasts.find((t) => t.title === "Deleted “Write the copy”")?.action).toBeTruthy()
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("opens the highlighted task with Enter", () => {
    const store = renderList()
    press("j")
    press("j")
    press("Enter")
    expect(store.getState().rightPanel.rightPanelState).toMatchObject({ isOpen: true, data: { taskUUID: "t2" } })
  })

  // STEP4 #8: the panel's previous and next open a task of the list with no
  // key reaching the list. The highlight goes with them, so J and K go on
  // from there, not from the row first opened, and one row reads as open.
  it("follows a task the panel opens, so K goes on from it", () => {
    const store = renderList()
    press("j")
    press("Enter")
    act(() => void store.dispatch(openRightPanel({ taskUUID: "t3" })))
    expect(row("Book the retro")).toHaveAttribute("data-highlighted")
    expect(row("Write the copy")).not.toHaveAttribute("data-highlighted")
    press("k")
    expect(store.getState().rightPanel.rightPanelState.data.taskUUID).toBe("t2")
  })

  it("edits the highlighted task when nothing is selected", async () => {
    renderList()
    press("j")
    press("p")
    expect(await screen.findByPlaceholderText("Set priority…")).toBeInTheDocument()
    expect(screen.getByRole("toolbar", { name: "1 task selected" })).toBeInTheDocument()
  })

  it("stands aside while typing, and while G waits for its letter", () => {
    renderList()
    const search = screen.getByLabelText("Search")
    search.focus()
    press("j")
    expect(document.querySelector("[data-highlighted]")).toBeNull()
    search.blur()
    armGo(Date.now())
    press("t")
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("picks with Ctrl/⌘-click instead of opening", () => {
    const store = renderList()
    fireEvent.click(screen.getByText("Book the retro"), { metaKey: true })
    expect(row("Book the retro")).toHaveAttribute("data-state", "selected")
    expect(store.getState().rightPanel.rightPanelState.isOpen).toBe(false)
  })
})

describe("a board from the keyboard", () => {
  it("keeps J and K in the column, and crosses with the arrows", () => {
    const store = configureStore({ reducer: { split: splitSlice.reducer, rightPanel: desktopRightPanelSlice.reducer } })
    const [a, b, c] = TASKS
    render(
      <Provider store={store}>
        <div data-split-view="-1">
          <KeyboardList tasks={TASKS} canEdit={() => true} placement="overlay">
            <div data-column="todo">
              <Card t={a} />
              <Card t={b} />
            </div>
            <div data-column="done">
              <Card t={c} />
            </div>
          </KeyboardList>
        </div>
      </Provider>,
    )
    const card = (name: string) => screen.getByText(name)
    press("j")
    press("j")
    press("j")
    expect(card("Pick the hero")).toHaveAttribute("data-highlighted")
    press("ArrowRight")
    expect(card("Book the retro")).toHaveAttribute("data-highlighted")
    // Back at the same height: the first card, as "Book the retro" is the first in its column.
    press("ArrowLeft")
    expect(card("Write the copy")).toHaveAttribute("data-highlighted")
  })
})

describe("the bar's pickers", () => {
  it("says why when a key asks for people across projects", async () => {
    const store = configureStore({ reducer: { split: splitSlice.reducer, rightPanel: desktopRightPanelSlice.reducer } })
    const inProject = (t: TaskInfoInterface, p: string) => ({ ...t, task_project: { project_uuid: p } }) as TaskInfoInterface
    const tasks = [inProject(TASKS[0], "p1"), inProject(TASKS[1], "p2")]
    render(
      <Provider store={store}>
        <div data-split-view="-1">
          <KeyboardList tasks={tasks} canEdit={() => true}>
            <table>
              <tbody>
                {tasks.map((t) => (
                  <TaskTableRow key={t.task_uuid} id={t.task_uuid}>
                    <td>{t.task_name}</td>
                  </TaskTableRow>
                ))}
              </tbody>
            </table>
          </KeyboardList>
        </div>
      </Provider>,
    )
    press("j")
    press("x")
    press("j")
    press("x")
    press("a")
    await act(async () => {})
    expect(screen.queryByPlaceholderText("Assign to…")).toBeNull()
    // The picker is not left waiting to spring open later.
    press("s")
    expect(await screen.findByPlaceholderText("Move to…")).toBeInTheDocument()
  })
})

describe("loading a task before it's opened", () => {
  it("fetches the task the keys move to, and the one the pointer rests on", async () => {
    vi.useFakeTimers()
    prefetched.length = 0
    renderList()
    act(() => void fireEvent.keyDown(document.body, { key: "j" }))
    expect(prefetched.some((u) => u.endsWith("/t1"))).toBe(true)
    const other = document.querySelector('[data-task-id="t2"]')!
    act(() => void fireEvent.pointerOver(other))
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS))
    expect(prefetched.some((u) => u.endsWith("/t2"))).toBe(true)
    vi.useRealTimers()
  })
})

// linear-28 H1b: while tasks are selected, the palette (⌘K) acts on them. The
// bar offers its own fields, with its keys, and a pick there is the bar's own
// change: the same request, the same rule about who may change what, the same
// toast. The reads a page needs (people, tags, milestones) are made as it
// opens, under the keys the bar's own pickers read.
describe("the selection in the palette (linear-28)", () => {
  const selectionSurface = () => offeredSurfaces().find((s) => s.id === "tasks")
  const lastChange = () => (bulk.mock.calls.at(-1) as unknown as [TaskInfoInterface[], unknown])[1]
  async function selectionEntries() {
    const s = selectionSurface()!
    return s.entries(await s.load!())
  }
  const pick = async (entries: PaletteEntry[], id: string, value: string) => {
    await act(async () => void entries.find((e) => e.id === id)!.apply!(value))
  }
  const selectTwo = async () => {
    press("j")
    press("x")
    press("j")
    press("x")
    expect(await screen.findByRole("toolbar", { name: "2 tasks selected" })).toBeInTheDocument()
  }

  it("offers the bar's fields while tasks are selected, first, under how many; takes them back when the selection clears", async () => {
    renderList()
    expect(selectionSurface()).toBeUndefined()
    await selectTwo()
    const s = selectionSurface()!
    expect([s.group, s.lead]).toEqual(["2 tasks selected", true])
    // One project's list: its milestones (Shift+M), and no cycles off its backlog.
    expect((await selectionEntries()).map((e) => [e.id, e.keys])).toEqual([
      ["status", "S"],
      ["assignee", "A"],
      ["tags", "T"],
      ["priority", "P"],
      ["due", "D"],
      ["milestone", "⇧ M"],
    ])
    press("Escape")
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(selectionSurface()).toBeUndefined()
  })

  // Assigning asks for the tasks of one project, as the bar's A does ("Pick
  // tasks from one project to assign them"). A list with no project of its own,
  // holding a selection from two, offers the bar's other fields and no Assign:
  // the palette never changes what the bar refuses (CR-135, H1b FIX-1).
  it("offers no Assign for a selection across two projects on a list with no project of its own", async () => {
    const store = configureStore({ reducer: { split: splitSlice.reducer, rightPanel: desktopRightPanelSlice.reducer } })
    const inProject = (t: TaskInfoInterface, p: string) => ({ ...t, task_project: { project_uuid: p } }) as TaskInfoInterface
    const tasks = [inProject(TASKS[0], "p1"), inProject(TASKS[1], "p2")]
    render(
      <Provider store={store}>
        <div data-split-view="-1">
          <KeyboardList tasks={tasks} canEdit={() => true}>
            <table>
              <tbody>
                {tasks.map((t) => (
                  <TaskTableRow key={t.task_uuid} id={t.task_uuid}>
                    <td>{t.task_name}</td>
                  </TaskTableRow>
                ))}
              </tbody>
            </table>
          </KeyboardList>
        </div>
      </Provider>,
    )
    await selectTwo()
    expect((await selectionEntries()).map((e) => [e.id, e.keys])).toEqual([
      ["status", "S"],
      ["tags", "T"],
      ["priority", "P"],
      ["due", "D"],
    ])
  })

  it("changes the selection as the bar does: its request, its toast", async () => {
    renderList()
    await selectTwo()
    await pick(await selectionEntries(), "status", "done")
    expect(bulk).toHaveBeenCalledOnce()
    const [tasks, change] = bulk.mock.calls[0] as unknown as [TaskInfoInterface[], { field: string; value: string }]
    expect(tasks.map((t) => t.task_uuid).sort()).toEqual(["t1", "t2"])
    expect(change).toMatchObject({ field: "status", value: "done" })
    expect(toasts.map((t) => t.title)).toContain("Moved 2 tasks to Done")
  })

  it("changes only the tasks this person may change, and offers nothing when they may change none", async () => {
    renderList((t) => t.task_uuid !== "t2")
    await selectTwo()
    const entries = await selectionEntries()
    // The date picker's own quick days: Tomorrow is the next local midnight.
    const due = entries.find((e) => e.id === "due")!
    const days = await due.choices!()
    expect(days.map((d) => d.label)).toEqual(["Today", "Tomorrow", "Next week", "No due date"])
    await pick(entries, "due", days[1].value)
    const [tasks, change] = bulk.mock.calls[0] as unknown as [TaskInfoInterface[], { field: string; value: string }]
    expect(tasks.map((t) => t.task_uuid)).toEqual(["t1"])
    const tomorrow = new Date()
    tomorrow.setHours(0, 0, 0, 0)
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(change).toEqual({ field: "due", value: tomorrow.toISOString() })
    cleanup()

    renderList(() => false)
    press("j")
    press("x")
    expect(await screen.findByRole("toolbar", { name: "1 task selected" })).toBeInTheDocument()
    expect(await selectionEntries()).toEqual([])
  })

  it("reads the project's people, tags and milestones as their pages open, and assigns, tags and moves them", async () => {
    renderList()
    await selectTwo()
    const entries = await selectionEntries()
    expect(readInto).not.toHaveBeenCalled()

    const people = await entries.find((e) => e.id === "assignee")!.choices!()
    expect(people.map((c) => c.label)).toEqual(["No one", "Ada"])
    await pick(entries, "assignee", "u-ada")
    expect(lastChange()).toMatchObject({ field: "assignee", user: { user_uuid: "u-ada" } })
    expect(toasts.at(-1)?.title).toBe("Assigned 2 tasks to Ada")

    const tags = await entries.find((e) => e.id === "tags")!.choices!()
    expect(tags.map((c) => [c.label, !!c.current])).toEqual([["launch", false]])
    await pick(entries, "tags", "launch")
    expect(lastChange()).toEqual({ field: "tags", tag: "launch", add: true })

    const milestones = await entries.find((e) => e.id === "milestone")!.choices!()
    expect(milestones.map((c) => c.label)).toEqual(["No milestone", "Beta"])
    await pick(entries, "milestone", "m-beta")
    expect(lastChange()).toEqual({ field: "milestone", value: "m-beta" })
    expect(toasts.at(-1)?.title).toBe("Put 2 tasks in Beta")

    // Each read under the key the bar's own picker reads, so the two agree.
    expect(readInto.mock.calls.map((c) => c[1]).sort()).toEqual([`${ProjectsGet.GetProjectMemberInfo}/p1`, milestonesPath("p1"), projectTagsKey("p1")].sort())
  })
})
