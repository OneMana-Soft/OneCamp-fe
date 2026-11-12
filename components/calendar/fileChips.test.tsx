import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// An event's Linked chips (calendar head B, gcal-1a; EVLINK head B, gcal-15): a doc, a board or a task, each a live
// chip named by the reader's own read (POST /entities), never by the event, which carries to each reader only what
// they may open (no locked chip to draw); one deleted says so. A task's chip opens the task as the app does: in the
// task panel on a computer, its own page on a phone. Remove is for whoever may change the event.
const DOC = { kind: "doc", uuid: "9d1c0000-0000-4000-8000-000000000001" } as const
const TASK = { kind: "task", uuid: "9d1c0000-0000-4000-8000-000000000002" } as const
const BOARD = { kind: "board", uuid: "9d1c0000-0000-4000-8000-000000000003" } as const
const GONE = { kind: "board", uuid: "9d1c0000-0000-4000-8000-000000000004" } as const
const reads: Array<Array<{ kind: string; id: string }>> = []
const { push, dispatch } = vi.hoisted(() => ({ push: vi.fn(), dispatch: vi.fn() }))
vi.mock("@/services/connectedService", () => ({
  MAX_REFS: 100,
  readEntities: async (refs: Array<{ kind: string; id: string }>) => {
    reads.push(refs)
    return refs.map((r) =>
      r.id === DOC.uuid
        ? { kind: "doc", id: r.id, access: "ok", data: { title: "Launch brief" } }
        : r.id === BOARD.uuid
          ? { kind: "board", id: r.id, access: "ok", data: { title: "Launch plan" } }
          : r.id === TASK.uuid
            ? { kind: "task", id: r.id, access: "ok", data: { name: "Book the venue", status: "todo", status_name: "To do", done: false, can_edit: true } }
            : { kind: "board", id: r.id, access: "gone" },
    )
  },
}))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => {} }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: () => null }))
vi.mock("@/store/store", () => ({ default: { dispatch, getState: () => ({}), subscribe: () => () => {} } }))

import { FileChips } from "@/components/calendar/fileChips"

const onPhone = (phone: boolean) =>
  vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: phone, media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false }) as MediaQueryList)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  push.mockReset()
  dispatch.mockReset()
})

describe("an event's Linked chips", () => {
  it("names a doc, a board and a task by the reader's own read, and says one deleted", async () => {
    render(<FileChips files={[DOC, BOARD, TASK, GONE]} />)
    expect(screen.getByRole("list", { name: "Linked" })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole("link", { name: "Task: Book the venue" })).toBeTruthy())
    expect(screen.getByRole("link", { name: "Page: Launch brief" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Board: Launch plan" }).getAttribute("data-entity-chip")).toBe("board")
    expect(document.querySelector(`[data-file='${GONE.uuid}'] [data-entity-chip]`)!.textContent).toBe("Deleted board")
    expect(reads.flat().map((r) => r.kind).sort()).toEqual(["board", "board", "doc", "task"])
    // A reader gets no remove.
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull()
  })

  it("opens a task in the task panel on a computer", async () => {
    onPhone(false)
    render(<FileChips files={[TASK]} />)
    fireEvent.click(await screen.findByRole("link", { name: "Task: Book the venue" }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ taskUUID: TASK.uuid }) }))
    expect(push).not.toHaveBeenCalled()
  })

  it("opens a task at its own page on a phone", async () => {
    onPhone(true)
    render(<FileChips files={[TASK]} />)
    fireEvent.click(await screen.findByRole("link", { name: "Task: Book the venue" }))
    expect(push).toHaveBeenCalledWith(`/app/task/${TASK.uuid}`)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ taskUUID: TASK.uuid }) }))
  })

  it("lets whoever may change the event unlink one, named as they read it", async () => {
    const onRemove = vi.fn()
    render(<FileChips files={[DOC, TASK, GONE]} onRemove={onRemove} />)
    fireEvent.click(await screen.findByRole("button", { name: "Remove Book the venue" }))
    expect(onRemove).toHaveBeenCalledWith(TASK)
    fireEvent.click(await screen.findByRole("button", { name: "Remove a deleted board" }))
    expect(onRemove).toHaveBeenLastCalledWith(GONE)
  })
})
