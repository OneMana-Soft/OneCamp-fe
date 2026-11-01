import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { TableField } from "@/services/tableService"

const transformRows = vi.fn()
vi.mock("@/lib/tables/transform", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/transform")>()), transformRows: (...a: unknown[]) => transformRows(...a) }))
const undoChange = vi.fn()
vi.mock("@/lib/tables/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/ledger")>()), undoChange: (...a: unknown[]) => undoChange(...a) }))
const offers: { title: string; undo: () => unknown; description?: string }[] = []
vi.mock("@/components/ui/undoToast", () => ({ useUndoToast: () => (title: string, undo: () => unknown, description?: string) => void offers.push({ title, undo, description }) }))

import { CleanupDialog } from "@/components/table/cleanup/CleanupDialog"
import type { ViewRows } from "@/lib/tables/viewRows"

const field = (id: string, type: TableField["type"]): TableField => ({ id, table_id: "t", name: id[0].toUpperCase() + id.slice(1), type, config: "{}", position: 0 })
const shown = [field("name", "text"), field("email", "email"), field("amount", "number"), field("first", "text"), field("last", "text")]
const view = async (): Promise<ViewRows> => ({ tableId: "t", fields: shown, rows: [], complete: true, rules: { match: "all", sort: [], filters: [] }, me: null, answers: null, query: "" })
const result = (over: object) => ({ walked: 2500, rows: 0, cells: 0, deleted: 0, matches: [], capped: false, change_sets: [], skipped: [], skipped_count: 0, kept_changed: 0, ...over })

afterEach(() => {
  cleanup()
  transformRows.mockReset()
  undoChange.mockReset()
  offers.length = 0
})

function open(step: "dedupe" | "trim" | "split", from?: string) {
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(<CleanupDialog step={step} field={from} tableId="t" shown={shown} view={view} onChanged={onChanged} onClose={onClose} />)
  return { onChanged, onClose }
}

describe("the table's clean-up (G2b)", () => {
  it("counts a dedupe's duplicates with a dry run first, then removes them as one step with one Undo", async () => {
    transformRows.mockResolvedValueOnce(result({ rows: 12 })).mockResolvedValueOnce(result({ rows: 12, deleted: 12, change_sets: ["c9"] }))
    const { onChanged, onClose } = open("dedupe")
    await screen.findByText("12 duplicate rows of 2,500")
    expect(transformRows).toHaveBeenCalledWith("t", expect.objectContaining({ step: "dedupe", dry_run: true, fields: ["name", "email", "amount", "first", "last"], rows: [] }), expect.anything())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove 12 rows" })))
    expect(transformRows).toHaveBeenLastCalledWith("t", expect.objectContaining({ step: "dedupe", fields: ["name", "email", "amount", "first", "last"] }), undefined)
    expect(transformRows.mock.calls[1][1].dry_run).toBeUndefined()
    await waitFor(() => expect(offers[0]?.title).toBe("Removed 12 duplicate rows"))
    expect(onChanged).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    await offers[0].undo()
    expect(undoChange).toHaveBeenCalledWith("t", "c9")
  })

  it("trims only the column it was opened from, and says when there's nothing to trim", async () => {
    transformRows.mockResolvedValue(result({}))
    open("trim", "email")
    await screen.findByText("No spaces to trim in 2,500 rows")
    expect(transformRows).toHaveBeenLastCalledWith("t", expect.objectContaining({ step: "trim", dry_run: true, fields: ["email"] }), expect.anything())
    expect((screen.getByRole("button", { name: /^Trim/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("splits a column into the fields picked, saying how many filled cells it would write over", async () => {
    transformRows.mockResolvedValue(result({ rows: 40, cells: 40, max_parts: 3, overwrites: 2 }))
    open("split", "name")
    fireEvent.click(screen.getByRole("checkbox", { name: "First" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Last" }))
    await screen.findByText("Splits 40 cells into up to 3 parts")
    expect(screen.getByText("2 filled cells will be written over")).toBeTruthy()
    expect(transformRows).toHaveBeenLastCalledWith("t", expect.objectContaining({ step: "split", fields: ["name"], into: ["first", "last"], separator: ",", dry_run: true }), expect.anything())
  })

  it("tells someone who can only view the table so, and offers nothing to apply", async () => {
    transformRows.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { msg: "forbidden" } } })
    open("dedupe")
    await screen.findByText("You can view this table, not change it")
    expect((screen.getByRole("button", { name: /^Remove/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
