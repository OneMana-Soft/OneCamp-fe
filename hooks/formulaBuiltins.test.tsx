import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import useSWR, { SWRConfig } from "swr"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { GetEndpointUrl } from "@/services/endPoints"
import { projectFieldsKey } from "@/hooks/useProjectFields"
import { pinTestClock } from "@/lib/testing/testClock"

// A formula's dates read the clock: pinned, not the machine's.
pinTestClock()

// V-762 (web half) and J-F's refetch: a formula task field may read a task's
// built-ins (its dates, status, priority, estimate, points), and the server
// tells a built-in change with no formula's new value. In a project with a
// formula field, every open board and panel reads the task again as its
// reader, so a result never goes stale; elsewhere nothing is read again.

vi.mock("react-redux", () => ({ useDispatch: () => () => {} }))

const { useTaskMessageHandlers } = await import("@/hooks/useTaskMessageHandlers")

afterEach(cleanup)

const P = "p1"
const BOARD = `${GetEndpointUrl.GetProjectTaskListForKanban}/${P}`
const PANEL = `${GetEndpointUrl.GetTaskInfo}/a`
const formula = { id: "f-days", project_id: P, name: "Days left", type: "formula", options: [], on_card: true, position: 0, filter_id: "field_f", result: "number" }
const money = { ...formula, id: "f-budget", name: "Budget", type: "money" }

function open(fields: object[]) {
  const reads = { board: 0, panel: 0 }
  const cache = new Map<string, unknown>([[projectFieldsKey(P), { data: { data: { fields } } }]])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }}>
      <SWRMutateBridge />
      {children}
    </SWRConfig>
  )
  const task = { task_uuid: "a", task_name: "Book the venue", task_due_date: "", task_fields: { "f-days": 3 } }
  const views = renderHook(
    () => ({
      handlers: useTaskMessageHandlers({ userUuid: "u-sam" }),
      board: useSWR(BOARD, () => (reads.board++, { data: { project_tasks_todo: [task] } })).data,
      panel: useSWR(PANEL, () => (reads.panel++, { data: task })).data,
    }),
    { wrapper },
  ).result
  return { reads, views }
}

const moved = (views: ReturnType<typeof open>["views"], tasks = ["a"]) =>
  act(() => {
    for (const task of tasks) views.current.handlers.handleTaskDatesMessage(JSON.stringify({ data: { task_uuid: task, project_uuid: P, task_start_date: "", task_due_date: "2026-11-20T00:00:00Z" } }))
  })

describe("a built-in change heard live", () => {
  it("reads the task and its lists again where a formula field may read it", async () => {
    const { reads, views } = open([formula])
    await waitFor(() => expect(reads).toEqual({ board: 1, panel: 1 }))
    moved(views)
    await waitFor(() => expect(reads, "the panel and the board read the task again").toEqual({ board: 2, panel: 2 }))
  })

  // CR-B55 F1: a dependency's shift-along moves a chain of tasks, a message each; the lists change once for the
  // burst (DATES_BATCH_MS), and are read again once for it, never once per message.
  it("reads the lists again once for a burst of moved tasks, and each moved task's panel", async () => {
    const { reads, views } = open([formula])
    await waitFor(() => expect(reads).toEqual({ board: 1, panel: 1 }))
    moved(views, ["a", "b", "c"])
    await new Promise((r) => setTimeout(r, 250))
    expect(reads, "three messages: one read of the board, and a's panel once").toEqual({ board: 2, panel: 2 })
  })

  it("reads nothing again in a project with no formula field", async () => {
    const { reads, views } = open([money])
    await waitFor(() => expect(reads).toEqual({ board: 1, panel: 1 }))
    moved(views)
    await new Promise((r) => setTimeout(r, 250))
    expect(reads).toEqual({ board: 1, panel: 1 })
  })
})
