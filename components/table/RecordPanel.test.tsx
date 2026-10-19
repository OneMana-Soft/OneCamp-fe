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

// The row's comments are their own chunk (components/table/comments): a stand-in
// that shows what the record hands it, and reports a count for Notes' cell.
const comments = vi.hoisted(() => ({ props: null as null | Record<string, unknown>, counts: {} as Record<string, number> }))
vi.mock("@/components/table/comments/RowComments", async () => {
  const React = await import("react")
  function RowCommentsStandIn(p: { target: string | null; onCellCounts?: (c: Record<string, number>) => void }) {
    comments.props = p
    React.useEffect(() => p.onCellCounts?.(comments.counts), [p])
    return <div data-testid="row-comments" data-target={p.target ?? ""} />
  }
  return { default: RowCommentsStandIn }
})
// The row's page is its own chunk too (components/table/rowPage): a stand-in
// that shows which row and page the record hands it.
vi.mock("@/components/table/rowPage/RowPage", () => {
  function RowPageStandIn(p: { rowId: string; page?: string }) {
    return <div data-testid="row-page" data-row={p.rowId} data-page={p.page ?? ""} />
  }
  return { default: RowPageStandIn }
})
const { copy } = vi.hoisted(() => ({ copy: vi.fn() }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy, copied: false }) }))

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

  // With AI off, or on the edition without it, Fill again could only fail.
  it("offers no Fill again where AI is off, and still says a person wrote the cell", () => {
    ai.on = false
    panel(row(["summary"]))
    expect(screen.queryByRole("button", { name: "Fill again" })).toBeNull()
    expect(screen.getByText("Written by a person, so AI leaves it be")).toBeTruthy()
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

  // The title is as tall as its text, never as the record around it: it was
  // the record's visible height, a blank stretch above the fields.
  it("is as tall as its title's text", () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "TEXTAREA" ? 64 : 900
    })
    // The record around it is far taller than the title.
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "TEXTAREA" ? 64 : 900
    })
    open()
    const title = screen.getByRole("textbox", { name: "Item" }) as HTMLTextAreaElement
    expect(title.style.height).toBe("64px")
    scroll.mockRestore()
    client.mockRestore()
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

// Tables A1: a record is titled by the row's name, its primary field (FD-14),
// and says what each field is for (its description).
describe("a row's record and its fields", () => {
  const open = (with_: TableField[], values: Record<string, unknown>) =>
    render(
      <RecordPanel
        tableId="t"
        tableName="Launch budget"
        fields={with_}
        rows={[{ id: "r1", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) }]}
        rowId="r1"
        canManage
        commit={{ commitCell: vi.fn(), linkCell: vi.fn() }}
        onStep={vi.fn()}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />,
    )

  it("is titled by the primary field, wherever that field sits", () => {
    open(
      fields.map((f) => (f.id === "notes" ? { ...f, primary: true } : f)),
      { item: "Booth", summary: "A booth", notes: "Stand B" },
    )
    const title = screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement
    expect(title.value).toBe("Stand B")
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Stand B, a row of Launch budget")
    expect(screen.getByText("Item")).toBeTruthy()
  })

  // A table's first select is tinted until someone switches it off in its
  // column menu (optionChip tintedFields). Switched off, the record shows the
  // neutral chip and dot, as the grid and a guest's view do.
  it("keeps a select's chips neutral once its column switched tinting off", () => {
    const stage = (tinted?: boolean): TableField => ({
      id: "stage",
      table_id: "t",
      name: "Stage",
      type: "select",
      position: 3,
      config: JSON.stringify({ options: [{ id: "o_won", label: "Won", color: "green" }], ...(tinted === undefined ? {} : { tinted }) }),
    })
    const chip = () => screen.getAllByText("Won")[0].closest("[data-option-chip]")
    open([...fields, stage()], { item: "Booth", stage: "Won" })
    expect(chip()?.hasAttribute("data-tinted")).toBe(true)
    cleanup()
    open([...fields, stage(false)], { item: "Booth", stage: "Won" })
    expect(chip()).toBeTruthy()
    expect(chip()?.hasAttribute("data-tinted")).toBe(false)
  })

  it("says what a field is for, under its value", () => {
    open(
      fields.map((f) => (f.id === "notes" ? { ...f, description: "Who pays, and when" } : f)),
      { item: "Booth", summary: "A booth", notes: "" },
    )
    const said = screen.getByText("Who pays, and when")
    expect(said.tagName).toBe("DD")
    expect(said.hasAttribute("data-field-description")).toBe(true)
  })
})


// Comments on a row (tables A8): the record holds them, each field's button
// starts one on its cell and says how many it has, and the record copies a
// link to its row.
describe("a row's comments in its record", () => {
  afterEach(() => {
    comments.props = null
    comments.counts = {}
    copy.mockReset()
  })

  it("starts a comment on the cell whose button was chosen", async () => {
    panel(row())
    expect((await screen.findByTestId("row-comments")).dataset.target).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "Comment on Notes" }))
    expect(screen.getByTestId("row-comments").dataset.target).toBe("notes")
  })

  it("says how many comments a cell has", async () => {
    comments.counts = { notes: 2 }
    panel(row())
    await screen.findByRole("button", { name: "Comment on Notes, 2 comments" })
    expect(screen.getByRole("button", { name: "Comment on Summary" })).toBeTruthy()
  })

  it("copies a link to the row", async () => {
    panel(row())
    fireEvent.click(screen.getByRole("button", { name: "Copy a link to this row" }))
    expect(copy).toHaveBeenCalledWith(expect.stringMatching(/\/app\/tables\/t\?row=r1$/), expect.any(String))
  })
})

// Rows as pages (T2): the record shows the row's page under its fields, and
// opens as a page across the window, or beside the grid, as each person last
// chose.
describe("a row's page in its record", () => {
  afterEach(() => {
    try {
      window.localStorage.clear()
    } catch {
      // no storage in this run
    }
  })

  it("shows the row's page under its fields", async () => {
    panel({ ...row(), page: "d1" })
    const page = await screen.findByTestId("row-page")
    expect(page.dataset.row).toBe("r1")
    expect(page.dataset.page).toBe("d1")
  })

  it("opens as a page, and back beside the grid, and remembers which", async () => {
    panel(row())
    const dialog = screen.getByRole("dialog")
    expect(dialog.hasAttribute("data-record-as-page")).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Open as a page" }))
    expect(dialog.hasAttribute("data-record-as-page")).toBe(true)
    expect(screen.getByRole("button", { name: "Back to the side panel" }).getAttribute("aria-pressed")).toBe("true")
    cleanup()
    panel(row())
    expect(await screen.findByRole("button", { name: "Back to the side panel" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Back to the side panel" }))
    expect(screen.getByRole("dialog").hasAttribute("data-record-as-page")).toBe(false)
  })
})
