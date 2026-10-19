import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// A row's history in its record (tables A2): read when it's opened, one line
// a change, newest first, and more on "Show more".

const ledger = vi.hoisted(() => ({ readRowHistory: vi.fn() }))
vi.mock("@/lib/tables/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/ledger")>()), ...ledger }))

import { RowHistory } from "@/components/table/history/RowHistory"
import type { HistoryItem } from "@/lib/tables/ledger"
import type { TableField } from "@/services/tableService"

const fields: TableField[] = [{ id: "status", table_id: "t", name: "Status", type: "select", config: "{}", position: 0 }]
const at = new Date().toISOString()
const edit = (id: string, before: string, after: string): HistoryItem => ({
  change_set: id,
  kind: "edit",
  actor_kind: "person",
  actor_name: "Maya",
  at,
  changes: [{ field: "status", before, after }],
})

afterEach(() => {
  cleanup()
  ledger.readRowHistory.mockReset()
})

describe("a row's history", () => {
  it("is read when it's opened, not before", async () => {
    ledger.readRowHistory.mockResolvedValue({ items: [edit("c2", "Open", "Won"), edit("c1", "New", "Open")], more: false })
    render(<RowHistory tableId="t" rowId="r1" fields={fields} />)
    expect(ledger.readRowHistory).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "History" })))
    const lines = await screen.findAllByText(/^Maya changed Status/)
    expect(lines.map((l) => l.textContent)).toEqual(["Maya changed Status from Open to Won", "Maya changed Status from New to Open"])
    expect(ledger.readRowHistory).toHaveBeenCalledWith("t", "r1", undefined)
  })

  it("reads more from the last change shown", async () => {
    ledger.readRowHistory.mockResolvedValueOnce({ items: [edit("c2", "Open", "Won")], more: true })
    ledger.readRowHistory.mockResolvedValueOnce({ items: [edit("c1", "New", "Open")], more: false })
    render(<RowHistory tableId="t" rowId="r1" fields={fields} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "History" })))
    const more = await screen.findByRole("button", { name: "Show more" })
    await act(async () => fireEvent.click(more))
    expect(ledger.readRowHistory).toHaveBeenLastCalledWith("t", "r1", "c2")
    await waitFor(() => expect(screen.getByText("Maya changed Status from New to Open")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })

  it("drops a late answer for a row stepped away from", async () => {
    let answer: (h: { items: HistoryItem[]; more: boolean }) => void = () => {}
    ledger.readRowHistory.mockImplementationOnce(() => new Promise((r) => (answer = r)))
    ledger.readRowHistory.mockResolvedValueOnce({ items: [edit("c9", "Lost", "Won")], more: false })
    const { rerender } = render(<RowHistory tableId="t" rowId="r1" fields={fields} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "History" })))
    rerender(<RowHistory tableId="t" rowId="r2" fields={fields} />)
    await act(async () => answer({ items: [edit("c1", "New", "Open")], more: false }))
    await waitFor(() => expect(screen.getByText("Maya changed Status from Lost to Won")).toBeTruthy())
    expect(screen.queryByText("Maya changed Status from New to Open")).toBeNull()
  })
})
