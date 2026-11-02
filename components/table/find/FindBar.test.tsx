import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { TableField } from "@/services/tableService"

const transformRows = vi.fn()
vi.mock("@/lib/tables/transform", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/transform")>()), transformRows: (...a: unknown[]) => transformRows(...a) }))
const undoChange = vi.fn()
vi.mock("@/lib/tables/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/ledger")>()), undoChange: (...a: unknown[]) => undoChange(...a) }))
// Each toast offered: its Undo runs the hook's onDone after it, as the real one does, and asked is how many steps
// the server had been asked when the toast came (so a toast that comes before the count after a write shows).
const offers: { title: string; undo: () => Promise<void>; description?: string; asked: number }[] = []
vi.mock("@/components/ui/undoToast", () => ({
  useUndoToast: (onDone?: () => void) => (title: string, undo: () => unknown, description?: string) =>
    void offers.push({ title, undo: async () => (await undo(), onDone?.()), description, asked: transformRows.mock.calls.length }),
}))

import { FindBar } from "@/components/table/find/FindBar"
import { TableEditProvider } from "@/lib/tables/tableEdit"
import type { ViewRows } from "@/lib/tables/viewRows"
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"

/** The table's undo order as a write that only sends: the tests of the order hold their own. */
const pass: UndoOrder["write"] = (_what, send) => send()
/** The toasts' one Undo path (the page's commit.undo). */
const undoSet = vi.fn<(set: string) => Promise<unknown>>(async () => undefined)
/** Lets what has settled so far run on: a press free to run has run. */
const tick = () => new Promise((r) => setTimeout(r, 0))

const field = (id: string, type: TableField["type"]): TableField => ({ id, table_id: "t", name: id[0].toUpperCase() + id.slice(1), type, config: "{}", position: 0 })
const shown = [field("name", "text"), field("amount", "number"), field("notes", "long_text")]
const viewOf = (fields: TableField[]) => async (): Promise<ViewRows> => ({ tableId: "t", fields, rows: [], complete: true, rules: { match: "all", sort: [], filters: [] }, me: null, answers: null, query: "" })
/** The words a Replace that can't apply rests with: which fields it changes. */
const CHANGES = "Replace changes text, long text, URL, email and phone fields."
const inField = (f: string, n: number) => Array.from({ length: n }, (_, i) => ({ row: `r${i}`, field: f, at: i }))
const steps = () => transformRows.mock.calls.map(([, input]) => (input as { step: string }).step)
const found = (n: number) => ({
  walked: 10,
  rows: n,
  cells: n,
  deleted: 0,
  matches: Array.from({ length: n }, (_, i) => ({ row: `r${i}`, field: "name", at: i })),
  capped: false,
  change_sets: [],
  skipped: [],
  skipped_count: 0,
  kept_changed: 0,
})

afterEach(() => {
  cleanup()
  transformRows.mockReset()
  undoChange.mockReset()
  undoSet.mockClear()
  offers.length = 0
})

function bar(mode: "find" | "replace" = "find", fields = shown, write = pass) {
  const onReveal = vi.fn()
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(<FindBar write={write} undo={undoSet} mode={mode} opened={1} tableId="t" shown={fields} view={viewOf(fields)} onReveal={onReveal} onChanged={onChanged} onClose={onClose} />)
  return { onReveal, onChanged, onClose }
}

describe("the table's find bar (G2b)", () => {
  it("finds, with no Replace row or its toggle, in a table its reader may only view (V-170)", () => {
    render(
      <TableEditProvider value={false}>
        <FindBar write={pass} undo={undoSet} mode="replace" opened={1} tableId="t" shown={shown} view={viewOf(shown)} onReveal={vi.fn()} onChanged={vi.fn()} onClose={vi.fn()} />
      </TableEditProvider>,
    )
    expect(screen.getByRole("textbox", { name: "Find" })).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "Replace with" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Replace all" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^(Show|Hide) replace$/ })).toBeNull()
  })

  it("counts what the server finds over the view, and steps through it with Enter and Shift+Enter", async () => {
    transformRows.mockResolvedValue(found(3))
    const { onReveal } = bar()
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "acme" } })
    await screen.findByText("1 of 3")
    expect(transformRows).toHaveBeenLastCalledWith("t", expect.objectContaining({ step: "find", find: "acme", fields: ["name", "amount", "notes"], rows: [] }), expect.anything())
    expect(onReveal).toHaveBeenLastCalledWith({ row: "r0", field: "name", at: 0 }, false)
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Find" }), { key: "Enter" })
    expect(screen.getByText("2 of 3")).toBeTruthy()
    expect(onReveal).toHaveBeenLastCalledWith({ row: "r1", field: "name", at: 1 }, false)
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Find" }), { key: "Enter", shiftKey: true })
    expect(screen.getByText("1 of 3")).toBeTruthy()
  })

  it("asks again with the case matched, the whole cell or a pattern, and says when nothing matches", async () => {
    transformRows.mockResolvedValue(found(0))
    bar()
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "^A" } })
    await screen.findByText("No matches")
    fireEvent.click(screen.getByRole("button", { name: "Match case" }))
    fireEvent.click(screen.getByRole("button", { name: "Whole cell" }))
    fireEvent.click(screen.getByRole("button", { name: "Regular expression" }))
    await waitFor(() => expect(transformRows).toHaveBeenLastCalledWith("t", expect.objectContaining({ find: "^A", match_case: true, whole_cell: true, regex: true }), expect.anything()))
  })

  it("replaces every match in the view's text fields as one step, with one Undo for all of it", async () => {
    transformRows.mockResolvedValueOnce(found(3)).mockResolvedValueOnce({ ...found(0), rows: 2, cells: 3, operation: "op", change_sets: ["c1", "c2"] }).mockResolvedValue(found(0))
    const { onChanged } = bar("replace")
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "acme" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Replace with" }), { target: { value: "Acme" } })
    await screen.findByText("1 of 3")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Replace all" })))
    expect(transformRows).toHaveBeenCalledWith("t", expect.objectContaining({ step: "replace", find: "acme", replace: "Acme", fields: ["name", "notes"], rows: [] }), undefined)
    await waitFor(() => expect(offers[0]?.title).toBe("Replaced 3 in 2 rows"))
    expect(onChanged).toHaveBeenCalled()
    // The toast comes with the count over the rows as they are now (the find, the write, then that count): never
    // beside the matches as they were, tinted on cells that no longer match.
    expect(offers[0].asked).toBe(3)
    expect(transformRows.mock.calls[2][1]).toMatchObject({ step: "find", find: "acme" })
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches"))
    // Its Undo brings the matches back into the count.
    transformRows.mockResolvedValueOnce(found(3))
    await act(async () => offers[0].undo())
    expect(undoSet, "the toast's Undo goes the table's one Undo path, by the replace's change set").toHaveBeenCalledWith("c1")
    expect(undoChange, "never straight to the ledger").not.toHaveBeenCalled()
    await screen.findByText("1 of 3")
  })

  it("tells someone who can only view the table so, in words, when a replace is refused", async () => {
    transformRows.mockResolvedValueOnce(found(1)).mockRejectedValueOnce({ isAxiosError: true, response: { status: 403, data: { msg: "forbidden" } } })
    bar("replace")
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "acme" } })
    await screen.findByText("1 of 1")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Replace all" })))
    await screen.findByText("You can view this table, not change it")
    expect(offers).toHaveLength(0)
  })

  it("lets the old matches go the moment a write lands: while the count comes back, it says Finding… and is at no match", async () => {
    let answer: (r: unknown) => void = () => {}
    transformRows
      .mockResolvedValueOnce(found(3))
      .mockResolvedValueOnce({ ...found(0), rows: 3, cells: 3, operation: "op", change_sets: ["c1"] })
      .mockImplementationOnce(() => new Promise((r) => (answer = r)))
    bar("replace")
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "acme" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Replace with" }), { target: { value: "Acme" } })
    await screen.findByText("1 of 3")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Replace all" })))
    await waitFor(() => expect(transformRows).toHaveBeenCalledTimes(3))
    // The count over the rows as they are now is on its way: no match to step to, and no toast before it.
    expect(screen.getByRole("status")).toHaveTextContent("Finding…")
    expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled()
    expect(offers).toHaveLength(0)
    await act(async () => answer(found(0)))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No matches"))
    expect(offers[0]?.title).toBe("Replaced 3 in 3 rows")
  })

  it("offers no replace for matches only in fields it can't change, and says why in words", async () => {
    // Finding "In progress" in Status to rename it: a choice, which a replace never writes.
    const fields = [field("name", "text"), field("stage", "select"), field("notes", "long_text")]
    transformRows.mockResolvedValue({ ...found(2), matches: inField("stage", 2) })
    bar("replace", fields)
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "In progress" } })
    await screen.findByText("1 of 2")
    expect(screen.getByRole("button", { name: "Replace" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Replace all" })).toBeDisabled()
    expect(screen.getByText(`None of these matches can be replaced. ${CHANGES}`)).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Replace with" }), { key: "Enter", ctrlKey: true })
    expect(steps()).not.toContain("replace")
  })

  it("on a match in a field it can't change, Replace rests and names that field; Replace all still takes the others", async () => {
    const fields = [field("name", "text"), field("stage", "select"), field("notes", "long_text")]
    transformRows.mockResolvedValue({ ...found(2), matches: [{ row: "r0", field: "stage", at: 0 }, { row: "r1", field: "name", at: 1 }] })
    bar("replace", fields)
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "Done" } })
    await screen.findByText("1 of 2")
    expect(screen.getByRole("button", { name: "Replace" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Replace all" })).toBeEnabled()
    expect(screen.getByText(`Stage can't be replaced. ${CHANGES}`)).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Find" }), { key: "Enter" })
    expect(screen.getByText("2 of 2")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Replace" })).toBeEnabled()
    expect(screen.queryByText(CHANGES, { exact: false })).toBeNull()
  })

  it("says, in a view that shows no text field, that Replace changes none of it, and never asks the server with no fields", async () => {
    const fields = [field("stage", "select"), field("amount", "number")]
    transformRows.mockResolvedValue({ ...found(1), matches: inField("amount", 1) })
    bar("replace", fields)
    expect(screen.getByText("Replace changes text, long text, URL, email and phone fields, and this view shows none.")).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "5" } })
    await screen.findByText("1 of 1")
    expect(screen.getByRole("button", { name: "Replace all" })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Replace with" }), { key: "Enter", ctrlKey: true })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Replace with" }), { key: "Enter" })
    expect(steps()).not.toContain("replace")
  })

  it("past the first 1,000 matches, counts those a replace would change with a find over just its fields", async () => {
    const fields = [field("name", "text"), field("stage", "select"), field("notes", "long_text")]
    // The first 1,000 of 1,200 are in Stage; the find over the text fields finds none of the rest there either.
    transformRows.mockResolvedValueOnce({ ...found(0), rows: 1200, cells: 1200, capped: true, matches: inField("stage", 1000) }).mockResolvedValue(found(0))
    bar("replace", fields)
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "Done" } })
    await screen.findByText(/^1 of 1.200$/)
    expect(transformRows).toHaveBeenLastCalledWith("t", expect.objectContaining({ step: "find", find: "Done", fields: ["name", "notes"] }), expect.anything())
    expect(screen.getByRole("button", { name: "Replace all" })).toBeDisabled()
    expect(screen.getByText(`None of these matches can be replaced. ${CHANGES}`)).toBeTruthy()
  })

  it("closes on Escape, leaving the focus on the match it was at", async () => {
    transformRows.mockResolvedValue(found(2))
    const { onReveal, onClose } = bar()
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "acme" } })
    await screen.findByText("1 of 2")
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Find" }), { key: "Escape" })
    expect(onReveal).toHaveBeenLastCalledWith({ row: "r0", field: "name", at: 0 }, true)
    expect(onClose).toHaveBeenCalled()
  })
})

// G2b-2 LIVE (DB-65's MUST 1): the phone's list draws its own rows, so the bar tells the page what it found and the
// match it's at, for the list to mark them; nothing once the box is emptied or the bar goes.
describe("the find bar over a phone's list", () => {
  it("tells the page its matches and the one it's at as it steps, and nothing once it finds nothing or goes", async () => {
    transformRows.mockResolvedValue(found(3))
    const onFound = vi.fn()
    const { unmount } = render(<FindBar write={pass} undo={undoSet} mode="find" opened={1} tableId="t" shown={shown} view={viewOf(shown)} onReveal={() => {}} onChanged={() => {}} onClose={() => {}} onFound={onFound} />)
    const box = screen.getByRole("textbox", { name: "Find" })
    fireEvent.change(box, { target: { value: "acme" } })
    await screen.findByText("1 of 3")
    const matches = found(3).matches
    expect(onFound).toHaveBeenLastCalledWith({ matches, current: matches[0] })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onFound).toHaveBeenLastCalledWith({ matches, current: matches[1] })
    fireEvent.change(box, { target: { value: "" } })
    await waitFor(() => expect(onFound).toHaveBeenLastCalledWith(null))
    fireEvent.change(box, { target: { value: "acme" } })
    await screen.findByText("1 of 3")
    unmount()
    expect(onFound).toHaveBeenLastCalledWith(null)
  })
})

// Main's 3b (V-360): a write the reader makes here is theirs to undo, so it enters the table's one undo order when
// made: a Ctrl+Z pressed while it's on its way waits for it and takes it, never the change before it.
describe("the find bar's replace, in the table's undo order", () => {
  const replaceHeld = async (answer: object) => {
    const order = new UndoOrder()
    let land!: (r: unknown) => void
    transformRows.mockResolvedValueOnce(found(3)).mockReturnValueOnce(new Promise((r) => (land = r))).mockResolvedValue(found(0))
    bar("replace", shown, (w, s, o, t) => order.write(w, s, o, t))
    fireEvent.change(screen.getByRole("textbox", { name: "Find" }), { target: { value: "acme" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Replace with" }), { target: { value: "Acme" } })
    await screen.findByText("1 of 3")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Replace all" })))
    const aims: Aim[] = []
    const pressed = order.press(async (aim) => void aims.push(aim))
    await tick()
    expect(aims, "nothing is undone while it's on its way").toEqual([])
    await act(async () => land({ ...found(0), ...answer }))
    await pressed
    return aims
  }
  // V-381: the Ctrl+Z took it back already, so no toast offers it again (its Undo would answer 409 "undone already").
  it("is what a Ctrl+Z pressed while it's on its way takes, by its change set, and then offers no toast", async () => {
    expect(await replaceHeld({ rows: 2, cells: 3, operation: "op", change_sets: ["c1", "c2"] })).toEqual([{ kind: "set", set: "c1" }])
    expect(offers, "no toast for a replace the Ctrl+Z took back").toEqual([])
  })
  // CR-190's S1: it said "That replace wasn't saved"; it was saved, and changed nothing.
  it("replaced nothing, so a Ctrl+Z pressed meanwhile takes nothing back and says it changed nothing", async () => {
    expect(await replaceHeld({})).toEqual([{ kind: "none", what: "replace" }])
  })
})
