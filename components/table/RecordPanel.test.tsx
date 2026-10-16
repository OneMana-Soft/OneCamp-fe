import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const fill = vi.fn()
// AI on, unless a test says otherwise (hooks/useClientConfig reads the server's config).
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  fillTableAIColumn: (...a: unknown[]) => fill(...a),
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), useToast: () => ({ toast }) }))

import { RecordPanel } from "@/components/table/RecordPanel"
import type { TableField, TableRow } from "@/services/tableService"

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "summary", table_id: "t", name: "Summary", type: "text", config: JSON.stringify({ ai: { prompt: "Sum up the row", auto: true } }), position: 1 },
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 2 },
]
const row = (kept?: string[]): TableRow => ({ id: "r1", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "Booth", summary: "A booth", notes: "" }), ai_kept: kept })
const panel = (r: TableRow, onChange = vi.fn()) =>
  render(
    <RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[r]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn() }} onStep={vi.fn()} onClose={vi.fn()} onChange={onChange} />,
  )

afterEach(() => {
  cleanup()
  fill.mockReset()
  toast.mockReset()
  ai.on = true
})

// TAB-BUG-4: a person's correction to an AI cell stays until someone asks the
// AI for it again, from the record.
describe("an AI column in a row's record", () => {
  it("offers to fill this row's cell again, and asks for the table after", async () => {
    fill.mockResolvedValue({ filled: 1, skipped: 0 })
    const changed = vi.fn()
    panel(row(), changed)
    expect(screen.queryByText(/Written by a person/)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fill again" })))
    expect(fill).toHaveBeenCalledWith("t", "summary", ["r1"])
    expect(changed).toHaveBeenCalled()
  })

  it("says a cell a person wrote is left be by the AI", () => {
    panel(row(["summary"]))
    expect(screen.getByText("Written by a person, so AI leaves it be")).toBeTruthy()
  })

  it("offers nothing for a column that isn't the AI's", () => {
    panel(row())
    expect(screen.getAllByRole("button", { name: "Fill again" })).toHaveLength(1)
  })

  // The model failing answers 200 with nothing filled: the panel said nothing.
  it("says so when the AI filled nothing", async () => {
    fill.mockResolvedValue({ filled: 0, skipped: 0 })
    panel(row())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fill again" })))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't fill this cell", description: "Try again in a moment." }))
  })

  // With AI off, or on the edition without it, Fill again could only fail; and
  // on this edition nothing fills a cell, so the record says nothing of AI.
  it("offers no Fill again where AI is off, and says nothing of AI", () => {
    ai.on = false
    panel(row(["summary"]))
    expect(screen.queryByRole("button", { name: "Fill again" })).toBeNull()
    expect(screen.queryByText(/AI leaves it be/)).toBeNull()
  })
})

// TAB-BUG-7: the record used the grid's input, and a title input too, which
// drop line breaks: the first edit saved the lines run together.
describe("a row's record with lines of text", () => {
  const lined: TableRow = { id: "r1", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "Booth\nHall 2", summary: "", notes: "Para one\n\nPara two" }) }
  const open = () => {
    const commitCell = vi.fn().mockResolvedValue(true)
    render(<RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[lined]} rowId="r1" canManage commit={{ commitCell, linkCell: vi.fn() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />)
    return commitCell
  }

  it("keeps a field's lines through the focus, typing and a save", () => {
    const commitCell = open()
    const notes = screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement
    expect(notes.value).toBe("Para one\n\nPara two")
    notes.focus()
    fireEvent.change(notes, { target: { value: "Para one\n\nPara two, again" } })
    fireEvent.blur(notes)
    expect(commitCell).toHaveBeenCalledWith(lined, "notes", "Para one\n\nPara two, again")
  })

  it("keeps the title's lines, and adds one on Shift+Enter", () => {
    const commitCell = open()
    const title = screen.getByRole("textbox", { name: "Item" }) as HTMLTextAreaElement
    expect(title.value).toBe("Booth\nHall 2")
    title.focus()
    title.setSelectionRange(title.value.length, title.value.length)
    fireEvent.keyDown(title, { key: "Enter", shiftKey: true })
    fireEvent.blur(title)
    expect(commitCell).toHaveBeenCalledWith(lined, "item", "Booth\nHall 2\n")
  })
})

// The record is where a row is read whole: a multi-select's cell there showed
// two of its options and "+N", as a grid row does.
describe("a row's record", () => {
  it("shows every option a multi-select holds", () => {
    const tags: TableField = { id: "tags", table_id: "t", name: "Tags", type: "multi_select", config: JSON.stringify({ options: ["A", "B", "C", "D"].map((l) => ({ id: `o_${l}`, label: l })) }), position: 3 }
    const r: TableRow = { id: "r1", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "Booth", tags: ["A", "B", "C", "D"] }) }
    render(<RecordPanel tableId="t" tableName="Launch budget" fields={[...fields, tags]} rows={[r]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />)
    for (const label of ["A", "B", "C", "D"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    expect(screen.queryByText("+2")).toBeNull()
  })
})
