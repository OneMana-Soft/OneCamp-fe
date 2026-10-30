import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const api = vi.hoisted(() => ({ patchRow: vi.fn() }))
vi.mock("@/services/tableService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/tableService")>()), patchRow: (...a: unknown[]) => api.patchRow(...a) }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), toast }))

import { TableTimeline } from "@/components/table/layouts/TableTimeline"
import type { TableField, TableRow } from "@/services/tableService"

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
  const props = { tableId: "t", fields, rows, edits: new Map(), look: null, onLook: vi.fn(), onOpen: vi.fn(), onChange: vi.fn(), ...over }
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
