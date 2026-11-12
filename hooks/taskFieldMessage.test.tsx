import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import useSWR, { SWRConfig } from "swr"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { GetEndpointUrl } from "@/services/endPoints"

// A task's field value set by someone else, heard live (MESSAGE_TASK_FIELD) by
// every open board, list and panel of the project. V-698: a money field's value
// is for the project's admins only, so the server tells its change to every
// member alike with no value (refetch: true), and each app reads the task again
// as itself. Applied as a value, it wrote null: every admin's open board and
// panel lost the amount until a reload.

vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))

const { useTaskMessageHandlers } = await import("@/hooks/useTaskMessageHandlers")

afterEach(cleanup)

const P = "p1"
const BOARD = `${GetEndpointUrl.GetProjectTaskListForKanban}/${P}`
const PANEL = `${GetEndpointUrl.GetTaskInfo}/a`
const BUDGET = "f-budget"

interface Task {
  task_uuid: string
  task_name: string
  task_fields?: Record<string, number>
}

/** The server's task a, and how many times the board and a's panel read it; reads answer when the test says. */
function server(budget: number) {
  const s = {
    task: { task_uuid: "a", task_name: "Book the venue", task_fields: { [BUDGET]: budget } } as Task,
    reads: { board: 0, panel: 0 },
    out: [] as (() => void)[],
    answer: () => s.out.splice(0).forEach((send) => send()),
    read: <T,>(which: "board" | "panel", body: () => T) => () =>
      new Promise<T>((resolve) => {
        s.reads[which]++
        s.out.push(() => resolve(body()))
      }),
  }
  return s
}

/** The board and a's panel open in one app, with its live task handlers. */
function openViews(s: ReturnType<typeof server>) {
  const cache = new Map()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }}>
      <SWRMutateBridge />
      {children}
    </SWRConfig>
  )
  const views = renderHook(
    () => ({
      handlers: useTaskMessageHandlers({ userUuid: "u-sam" }),
      board: useSWR(BOARD, s.read("board", () => ({ data: { project_tasks_todo: [{ ...s.task }] } }))).data,
      panel: useSWR(PANEL, s.read("panel", () => ({ data: { ...s.task } }))).data,
    }),
    { wrapper },
  ).result
  return views
}

type Views = ReturnType<typeof openViews>
const onBoard = (views: Views) => views.current.board?.data.project_tasks_todo[0]?.task_fields
const onPanel = (views: Views) => views.current.panel?.data.task_fields

/** The views' first reads, answered: both show a's budget. */
async function settled(s: ReturnType<typeof server>, views: Views, budget: number) {
  await waitFor(() => expect(s.reads).toEqual({ board: 1, panel: 1 }))
  await act(async () => s.answer())
  await waitFor(() => expect(onBoard(views)?.[BUDGET]).toBe(budget))
  await waitFor(() => expect(onPanel(views)?.[BUDGET]).toBe(budget))
}

/** MESSAGE_TASK_FIELD's data, as the server sends it on the project's topic. */
const heard = (views: Views, data: Record<string, unknown>) =>
  act(() => views.current.handlers.handleTaskFieldMessage(JSON.stringify({ type: 33, data: { task_uuid: "a", project_uuid: P, field_id: BUDGET, by: "u-fay", ...data } })))

describe("a task's field value heard live", () => {
  it("told with no value (refetch), keeps the open board's and panel's value and reads the task again", async () => {
    const s = server(120000)
    const views = openViews(s)
    await settled(s, views, 120000)

    // An admin sets the budget: every member hears that it changed, and none hears to what.
    s.task = { ...s.task, task_fields: { [BUDGET]: 150000 } }
    heard(views, { value: null, refetch: true })
    await waitFor(() => expect(s.reads, "the board and the panel read the task again").toEqual({ board: 2, panel: 2 }))
    expect(onBoard(views)?.[BUDGET], "the board's cell keeps its amount while it reads").toBe(120000)
    expect(onPanel(views)?.[BUDGET], "and so does the panel's").toBe(120000)

    await act(async () => s.answer())
    await waitFor(() => expect(onBoard(views)?.[BUDGET], "the board shows the amount the server answers").toBe(150000))
    await waitFor(() => expect(onPanel(views)?.[BUDGET]).toBe(150000))
  })

  it("told a value, writes it, and takes it off for null, reading nothing again", async () => {
    const s = server(120000)
    const views = openViews(s)
    await settled(s, views, 120000)

    heard(views, { value: 99000 })
    await waitFor(() => expect(onBoard(views)?.[BUDGET]).toBe(99000))
    await waitFor(() => expect(onPanel(views)?.[BUDGET]).toBe(99000))
    heard(views, { value: null, refetch: false })
    await waitFor(() => expect(onBoard(views)).toEqual({}))
    await waitFor(() => expect(onPanel(views)).toEqual({}))
    await act(() => new Promise((done) => setTimeout(done, 50)))
    expect(s.reads, "written in place: nothing is read again").toEqual({ board: 1, panel: 1 })
  })
})
