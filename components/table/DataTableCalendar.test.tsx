import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

const api = vi.hoisted(() => ({ createRow: vi.fn() }))
vi.mock("@/services/tableService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/tableService")>()), createRow: (...a: unknown[]) => api.createRow(...a) }))

import { DataTableCalendar } from "@/components/table/DataTableCalendar"
import { TableEditProvider } from "@/lib/tables/tableEdit"
import type { TableField, TableRow } from "@/services/tableService"
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"

/** The table's undo order as a write that only sends: the tests of the order hold their own. */
const pass: UndoOrder["write"] = (_what, send) => send()
/** Lets what has settled so far run on: a press free to run has run. */
const tick = () => new Promise((r) => setTimeout(r, 0))

pinTestClock(new Date(2026, 9, 14, 10)) // Wed 14 Oct
afterEach(() => {
  cleanup()
  api.createRow.mockReset()
})

const f = (id: string, name: string, type: string): TableField => ({ id, table_id: "t", name, type: type as TableField["type"], config: "{}", position: 0 })
const fields = [f("name", "Task", "text"), f("due", "Due", "date")]
const row = (id: string, name: string, due: string): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ name, due }) })
// Four rows on Tue 20 Oct: three in its cell, the fourth behind "+1 more".
const rows = ["Plan", "Draft", "Review", "Ship"].map((name, i) => row(`r${i + 1}`, name, "2026-10-20"))

const draw = (canEdit: boolean, compact = false, write = pass) => {
  const onOpenRow = vi.fn()
  render(
    <TableEditProvider value={canEdit}>
      <DataTableCalendar write={write} tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} month={new Date(2026, 9, 1)} onOpenRow={onOpenRow} compact={compact} />
    </TableEditProvider>,
  )
  return onOpenRow
}
// Every way the month adds a row: each day's +, a busy day's list foot, and the phone's picked day.
const adds = () => screen.queryAllByRole("button", { name: /^Add a row/ })

describe("a calendar for one who may only view the table (V-170)", () => {
  it("adds from no day, nor from a busy day's list, and its rows still open", () => {
    const open = draw(false)
    expect(adds()).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "+1 more" }))
    // The busy day's list is open: its rows, and no foot to add one.
    expect(screen.getByRole("button", { name: "Ship" })).toBeTruthy()
    expect(adds()).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Ship" }))
    expect(open).toHaveBeenCalledWith("r4")
    expect(api.createRow).not.toHaveBeenCalled()
  })

  it("on a phone, adds nothing on the picked day, and its rows still open", () => {
    const open = draw(false, true)
    fireEvent.click(screen.getByRole("button", { name: "Tuesday 20 October, 4 rows" }))
    expect(adds()).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: /^Ship/ }))
    expect(open).toHaveBeenCalledWith("r4")
    expect(api.createRow).not.toHaveBeenCalled()
  })

  // The same month for an editor: the ways the viewer is held to none are there, and each adds a row on its day.
  it("gives an editor a + on each day and a busy day's Add a row, each writing the row on that day", async () => {
    api.createRow.mockResolvedValue({ id: "r9" })
    draw(true)
    expect(screen.getByRole("button", { name: "Add a row on 14 October" })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add a row on 20 October" })))
    expect(api.createRow).toHaveBeenLastCalledWith("t", { due: "2026-10-20" })
    fireEvent.click(screen.getByRole("button", { name: "+1 more" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add a row" })))
    expect(api.createRow).toHaveBeenCalledTimes(2)
    expect(api.createRow).toHaveBeenLastCalledWith("t", { due: "2026-10-20" })
  })

  it("gives an editor on a phone the picked day's Add a row", async () => {
    api.createRow.mockResolvedValue({ id: "r9" })
    draw(true, true)
    fireEvent.click(screen.getByRole("button", { name: "Tuesday 20 October, 4 rows" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add a row on 20 October" })))
    expect(api.createRow).toHaveBeenLastCalledWith("t", { due: "2026-10-20" })
  })
})

// Main's 3b (V-360): a write the reader makes here is theirs to undo, so it enters the table's one undo order when
// made: a Ctrl+Z pressed while it's on its way waits for it and takes it, never the change before it.
describe("a row added on the calendar, in the table's undo order", () => {
  it("is what a Ctrl+Z pressed while it's on its way waits for, then takes", async () => {
    const order = new UndoOrder()
    let land!: (r: unknown) => void
    api.createRow.mockReturnValueOnce(new Promise((r) => (land = r)))
    draw(true, false, (w, s, o) => order.write(w, s, o))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add a row on 20 October" })))
    expect(api.createRow).toHaveBeenLastCalledWith("t", { due: "2026-10-20" })
    const aims: Aim[] = []
    const pressed = order.press(async (aim) => void aims.push(aim))
    await tick()
    expect(aims, "nothing is undone while it's on its way").toEqual([])
    await act(async () => land({ id: "r9" }))
    await pressed
    expect(aims).toEqual([{ kind: "latest" }])
  })
})
