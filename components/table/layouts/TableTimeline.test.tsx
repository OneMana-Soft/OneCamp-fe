import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const api = vi.hoisted(() => ({ patchRow: vi.fn() }))
vi.mock("@/services/tableService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/tableService")>()), patchRow: (...a: unknown[]) => api.patchRow(...a) }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), toast }))

import { TableTimeline } from "@/components/table/layouts/TableTimeline"
import { TableEditProvider } from "@/lib/tables/tableEdit"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import type { TableField, TableRow } from "@/services/tableService"
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"

/** The table's undo order as a write that only sends: the tests of the order hold their own. */
const pass: UndoOrder["write"] = (_what, send) => send()
/** Lets what has settled so far run on: a press free to run has run. */
const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 20, 10))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  api.patchRow.mockReset()
  toast.mockReset()
})

const f = (id: string, name: string, type: string, config: object = {}): TableField => ({ id, table_id: "t", name, type: type as TableField["type"], config: JSON.stringify(config), position: 0 })
const fields = [f("name", "Task", "text"), f("starts", "Starts", "date"), f("due", "Due", "date"), f("after", "After", "relation", { relation_target: "table", table_id: "t" })]
const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })
const rows = [
  row("r1", { name: "Design", starts: "2026-10-20", due: "2026-10-23" }),
  row("r2", { name: "Build", starts: "2026-10-26", due: "2026-10-30", after: [{ id: "r1", type: "row", table_id: "t" }] }),
  // Starts before what it waits on is done: the order is broken.
  row("r3", { name: "Ship", starts: "2026-10-22", after: [{ id: "r2", type: "row", table_id: "t" }] }),
  row("r4", { name: "Someday" }),
]
const draw = (over: Partial<React.ComponentProps<typeof TableTimeline>> = {}) => {
  const props = { tableId: "t", fields, rows, edits: new Map(), look: null, onLook: vi.fn(), onOpen: vi.fn(), onChange: vi.fn(), write: pass, ...over }
  render(<TableTimeline {...props} />)
  return props
}
const bar = (id: string) => document.querySelector<HTMLElement>(`[data-bar="${id}"]`)

describe("B4's timeline", () => {
  it("draws each row with days as a bar across them, named, and a row without days by its name alone", () => {
    draw()
    expect(bar("r1")?.getAttribute("aria-label")).toBe("Design: Tue 20 → Fri 23 Oct")
    expect(bar("r3")?.getAttribute("aria-label")).toBe("Ship: Thu 22 Oct")
    expect(bar("r4")).toBeNull()
    expect(screen.getByRole("button", { name: "Someday" })).toBeTruthy()
    // A bar four days long is four times one day's.
    expect(parseFloat(bar("r1")!.style.width)).toBe(4 * parseFloat(bar("r3")!.style.width))
    expect(document.querySelector("[data-timeline]")?.getAttribute("data-timeline")).toBe("timeline")
    // No arrows on the timeline: they're the Gantt's.
    expect(document.querySelectorAll("path[data-link]")).toHaveLength(0)
  })

  it("moves a bar a day with the arrow keys, writing its row's dates; Shift moves its end", async () => {
    api.patchRow.mockResolvedValue({})
    const p = draw()
    await act(async () => fireEvent.keyDown(bar("r1")!, { key: "ArrowRight" }))
    expect(api.patchRow).toHaveBeenLastCalledWith("t", "r1", { starts: "2026-10-21", due: "2026-10-24" })
    expect(p.onChange).toHaveBeenCalledTimes(1)
    await act(async () => fireEvent.keyDown(bar("r1")!, { key: "ArrowLeft", shiftKey: true }))
    expect(api.patchRow).toHaveBeenLastCalledWith("t", "r1", { starts: "2026-10-20", due: "2026-10-22" })
  })

  // CR-67's SF1: a refusal said "try again" over the request's own "Not allowed".
  it("leaves a refusal to the request's words, and the bar goes back", async () => {
    api.patchRow.mockRejectedValue(Object.assign(new Error("Request failed with status code 403"), { response: { status: 403 } }))
    const p = draw()
    const before = bar("r1")!.style.left
    await act(async () => fireEvent.keyDown(bar("r1")!, { key: "ArrowRight" }))
    expect(toast).not.toHaveBeenCalled()
    expect(p.onChange).not.toHaveBeenCalled()
    expect(bar("r1")!.style.left).toBe(before)
  })

  // CR-68's SF1: a write with no answer is said by the request too (lib/axiosInstance NO_ANSWER_TO_A_WRITE).
  it("leaves a move with no answer to the request's words, and the bar goes back", async () => {
    api.patchRow.mockRejectedValue(new Error("Network Error"))
    const p = draw()
    const before = bar("r1")!.style.left
    await act(async () => fireEvent.keyDown(bar("r1")!, { key: "ArrowRight" }))
    expect(toast).not.toHaveBeenCalled()
    expect(p.onChange).not.toHaveBeenCalled()
    expect(bar("r1")!.style.left).toBe(before)
  })

  it("opens a row's record from its bar and from its name", () => {
    const p = draw()
    fireEvent.pointerDown(bar("r2")!, { button: 0, clientX: 300 })
    fireEvent.pointerUp(bar("r2")!, { clientX: 300 })
    expect(p.onOpen).toHaveBeenLastCalledWith("r2")
    fireEvent.click(screen.getByRole("button", { name: "Design" }))
    expect(p.onOpen).toHaveBeenLastCalledWith("r1")
  })

  it("asks for a date field when the table has none", () => {
    draw({ fields: [f("name", "Task", "text")] })
    expect(screen.getByText("Add a date field to draw the rows across their days.")).toBeTruthy()
  })
})

describe("B4's Gantt", () => {
  it("draws what each row waits on as an arrow, red where it starts before what it waits on ends", () => {
    draw({ gantt: true })
    expect(document.querySelector("[data-timeline]")?.getAttribute("data-timeline")).toBe("gantt")
    const links = [...document.querySelectorAll("path[data-link]")].map((p) => p.getAttribute("data-link"))
    expect(links.sort()).toEqual(["broken", "kept"])
    expect(screen.getByRole("combobox", { name: "Waits on" }).textContent).toContain("After")
  })

  it("draws no arrows once the reader picks none", () => {
    draw({ gantt: true, look: { deps: null } })
    expect(document.querySelectorAll("path[data-link]")).toHaveLength(0)
  })
})

describe("a timeline for one who may only view the table (V-170)", () => {
  // A drag's pointer carries its point (jsdom has no PointerEvent).
  beforeAll(installPointerEvent)
  const drawFor = (canEdit: boolean) => {
    const props = { tableId: "t", fields, rows, edits: new Map(), look: null, onLook: vi.fn(), onOpen: vi.fn(), onChange: vi.fn(), write: pass }
    render(
      <TableEditProvider value={canEdit}>
        <TableTimeline {...props} />
      </TableEditProvider>,
    )
    return props
  }
  const ends = (id: string) => bar(id)!.querySelectorAll(".cursor-ew-resize")

  it("opens a bar's row on a press or a drag, and the arrows and the drag write nothing, the arrows left to the page", () => {
    api.patchRow.mockResolvedValue({})
    const p = drawFor(false)
    const b = bar("r1")!
    const left = b.style.left
    // No ends to pull, and a pointer that opens rather than grabs.
    expect(ends("r1")).toHaveLength(0)
    expect(b.className).toContain("cursor-pointer")
    expect(b.className).not.toContain("cursor-grab")
    // The arrows are not taken (they scroll the timeline), and write nothing.
    expect(fireEvent.keyDown(b, { key: "ArrowRight" })).toBe(true)
    expect(fireEvent.keyDown(b, { key: "ArrowLeft", shiftKey: true })).toBe(true)
    expect(b.getAttribute("aria-label")).toBe("Design: Tue 20 → Fri 23 Oct")
    // A drag moves the bar nowhere, and lets go as a press: the row opens.
    fireEvent.pointerDown(b, { button: 0, clientX: 300 })
    fireEvent.pointerMove(b, { clientX: 500 })
    expect(bar("r1")!.style.left).toBe(left)
    fireEvent.pointerUp(b, { clientX: 500 })
    expect(p.onOpen).toHaveBeenLastCalledWith("r1")
    expect(api.patchRow).not.toHaveBeenCalled()
    expect(p.onChange).not.toHaveBeenCalled()
  })

  // An editor's bar, for the contrast: both ends to pull and the grab pointer.
  it("gives an editor's bar both ends to pull and the grab pointer", () => {
    drawFor(true)
    expect(ends("r1")).toHaveLength(2)
    expect(bar("r1")!.className).toContain("cursor-grab")
  })
})

// Main's 3b (V-360): a write the reader makes here is theirs to undo, so it enters the table's one undo order when
// made: a Ctrl+Z pressed while it's on its way waits for it and takes it, never the change before it.
describe("a bar's move, in the table's undo order", () => {
  it("is what a Ctrl+Z pressed while it's on its way waits for, then takes by the change set its answer names", async () => {
    const order = new UndoOrder()
    let land!: (r: unknown) => void
    api.patchRow.mockReturnValueOnce(new Promise((r) => (land = r)))
    draw({ write: (w, s, o, t) => order.write(w, s, o, t) })
    await act(async () => fireEvent.keyDown(bar("r1")!, { key: "ArrowRight" }))
    expect(api.patchRow).toHaveBeenLastCalledWith("t", "r1", { starts: "2026-10-21", due: "2026-10-24" })
    const aims: Aim[] = []
    const pressed = order.press(async (aim) => void aims.push(aim))
    await tick()
    expect(aims, "nothing is undone while it's on its way").toEqual([])
    await act(async () => land({ ...rows[0], change_set: "c4" }))
    await pressed
    expect(aims).toEqual([{ kind: "set", set: "c4" }])
  })

  // CR-190's MUST 2 for the timeline: its finally dropped the bar before the read, so a taken move flickered back,
  // forward (the read of the moved row), then back (the Undo's read).
  it("goes back to its row's days at the press when a Ctrl+Z takes it, and its answer reads nothing (the Undo's read draws it)", async () => {
    const order = new UndoOrder()
    let land!: (r: unknown) => void
    api.patchRow.mockReturnValueOnce(new Promise((r) => (land = r)))
    const p = draw({ write: (w, s, o, t) => order.write(w, s, o, t) })
    const at = bar("r1")!.style.left
    await act(async () => fireEvent.keyDown(bar("r1")!, { key: "ArrowRight" }))
    expect(bar("r1")!.style.left, "on its way, the bar is drawn a day on").not.toBe(at)
    let pressed: Promise<unknown> = Promise.resolve()
    act(() => {
      pressed = order.press(async () => undefined)
    })
    expect(bar("r1")!.style.left, "the bar goes back at the press").toBe(at)
    await act(async () => land({ ...rows[0], change_set: "c4" }))
    await pressed
    expect(p.onChange, "a taken move's answer reads nothing").not.toHaveBeenCalled()
    expect(bar("r1")!.style.left).toBe(at)
  })
})
