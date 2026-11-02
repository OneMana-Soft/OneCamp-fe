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
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"

/** The table's undo order as a write that only sends: the tests of the order hold their own. */
const pass: UndoOrder["write"] = (_what, send) => send()
/** Lets what has settled so far run on: a press free to run has run. */
const tick = () => new Promise((r) => setTimeout(r, 0))

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

function open(step: "dedupe" | "trim" | "split", from?: string, write = pass) {
  const onChanged = vi.fn()
  const onClose = vi.fn()
  // The toasts' one Undo path (the page's commit.undo).
  const undo = vi.fn(async () => undefined)
  render(<CleanupDialog write={write} undo={undo} step={step} field={from} tableId="t" shown={shown} view={view} onChanged={onChanged} onClose={onClose} />)
  return { onChanged, onClose, undo }
}

describe("the table's clean-up (G2b)", () => {
  it("counts a dedupe's duplicates with a dry run first, then removes them as one step with one Undo", async () => {
    transformRows.mockResolvedValueOnce(result({ rows: 12 })).mockResolvedValueOnce(result({ rows: 12, deleted: 12, change_sets: ["c9"] }))
    const { onChanged, onClose, undo } = open("dedupe")
    await screen.findByText("12 duplicate rows of 2,500")
    expect(transformRows).toHaveBeenCalledWith("t", expect.objectContaining({ step: "dedupe", dry_run: true, fields: ["name", "email", "amount", "first", "last"], rows: [] }), expect.anything())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove 12 rows" })))
    expect(transformRows).toHaveBeenLastCalledWith("t", expect.objectContaining({ step: "dedupe", fields: ["name", "email", "amount", "first", "last"] }), undefined)
    expect(transformRows.mock.calls[1][1].dry_run).toBeUndefined()
    await waitFor(() => expect(offers[0]?.title).toBe("Removed 12 duplicate rows"))
    expect(onChanged).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    await offers[0].undo()
    expect(undo, "the toast's Undo goes the table's one Undo path, by the step's change set").toHaveBeenCalledWith("c9")
    expect(undoChange, "never straight to the ledger").not.toHaveBeenCalled()
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

// Main's 3b (V-360): a write the reader makes here is theirs to undo, so it enters the table's one undo order when
// made: a Ctrl+Z pressed while it's on its way waits for it and takes it, never the change before it.
describe("a clean-up's step, in the table's undo order", () => {
  const applyHeld = async (answer: object) => {
    const order = new UndoOrder()
    let land!: (r: unknown) => void
    transformRows.mockResolvedValueOnce(result({ rows: 12 })).mockReturnValueOnce(new Promise((r) => (land = r))).mockResolvedValue(result({ rows: 12 }))
    open("dedupe", undefined, (w, s, o, t) => order.write(w, s, o, t))
    await screen.findByText("12 duplicate rows of 2,500")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove 12 rows" })))
    const aims: Aim[] = []
    const pressed = order.press(async (aim) => void aims.push(aim))
    await tick()
    expect(aims, "nothing is undone while it's on its way").toEqual([])
    await act(async () => land(result(answer)))
    await pressed
    return aims
  }
  // V-381: the Ctrl+Z took it back already, so no toast offers it again (its Undo would answer 409 "undone already").
  it("is what a Ctrl+Z pressed while it's on its way takes, by its change set, and then offers no toast", async () => {
    expect(await applyHeld({ rows: 12, deleted: 12, change_sets: ["c9"] })).toEqual([{ kind: "set", set: "c9" }])
    expect(offers, "no toast for a clean-up the Ctrl+Z took back").toEqual([])
  })
  // CR-190's S1: it said "That clean-up wasn't saved"; it was saved, and changed nothing.
  it("changed nothing, so a Ctrl+Z pressed meanwhile takes nothing back and says it changed nothing", async () => {
    expect(await applyHeld({})).toEqual([{ kind: "none", what: "clean-up" }])
  })
})
