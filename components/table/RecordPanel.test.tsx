import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps, ComponentType } from "react"

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
// One confirm for every render: a test may answer what it asked (the record's delete).
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const ledger = vi.hoisted(() => ({ batchRows: vi.fn(), undoChange: vi.fn() }))
vi.mock("@/lib/tables/ledger", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/tables/ledger")>()), ...ledger }))
// The toasts the record offers, each with its Undo.
const offers = vi.hoisted(() => [] as { title: string; undo: () => unknown }[])
vi.mock("@/components/table/ledger/useUndoToast", () => ({ useUndoToast: () => (title: string, undo: () => unknown) => void offers.push({ title, undo }) }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), useToast: () => ({ toast }) }))

// The row's comments are their own chunk (components/table/comments): a stand-in
// that shows what the record hands it, and reports a count for Notes' cell. A test
// that sets `real` (to realComments(), below) gets the row's own comments, on no
// threads, read as Maya. The stand-in loads none of their code: a findBy waiting on
// it would wait on theirs, cold in a file run alone (CR-260 F3).
type RowCommentsProps = ComponentProps<typeof import("@/components/table/comments/RowComments").default>
const comments = vi.hoisted(() => ({ props: null as null | Record<string, unknown>, counts: {} as Record<string, number>, real: null as null | ComponentType<RowCommentsProps> }))
vi.mock("@/components/table/comments/RowComments", async () => {
  const React = await import("react")
  function RowCommentsStandIn(p: RowCommentsProps) {
    comments.props = p as unknown as Record<string, unknown>
    React.useEffect(() => p.onCellCounts?.(comments.counts), [p])
    const Real = comments.real
    if (Real) return <Real {...p} />
    return <div data-testid="row-comments" data-target={p.target ?? ""} />
  }
  return { default: RowCommentsStandIn }
})
vi.mock("@/components/threads/threadsApi", () => ({ listThreads: vi.fn(async () => []) }))
vi.mock("@/hooks/useFetch", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useFetch")>()
  const maya = { data: { data: { user_uuid: "me", user_name: "Maya" } }, isLoading: false, isError: undefined, mutate: vi.fn() }
  const useFetchOnlyOnce: typeof real.useFetchOnlyOnce = (...a) => (comments.real ? (maya as never) : real.useFetchOnlyOnce(...a))
  return { ...real, useFetchOnlyOnce }
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
import { TableEditProvider } from "@/lib/tables/tableEdit"
import type { TableField, TableRow } from "@/services/tableService"
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"
import { SCREENS, putOnScreen } from "@/lib/testing/screens"

/** The table's undo order as a write that only sends: the tests of the order hold their own. */
const pass: UndoOrder["write"] = (_what, send) => send()

/** The row's own comments in a store and tooltips of their own, loaded once, by the tests that set `comments.real`. */
let realOnce: Promise<ComponentType<RowCommentsProps>> | undefined
const realComments = () =>
  (realOnce ??= (async () => {
    const [{ Provider }, { configureStore }, { TooltipProvider }, threads, users, { default: RowComments }] = await Promise.all([
      import("react-redux"),
      import("@reduxjs/toolkit"),
      import("@/components/ui/tooltip"),
      import("@/store/slice/threadsSlice"),
      import("@/store/slice/userSlice"),
      vi.importActual<typeof import("@/components/table/comments/RowComments")>("@/components/table/comments/RowComments"),
    ])
    const store = configureStore({ reducer: { threads: threads.default.reducer, users: users.default.reducer } })
    return function RealRowComments(p: RowCommentsProps) {
      return (
        <Provider store={store}>
          <TooltipProvider>
            <RowComments {...p} />
          </TooltipProvider>
        </Provider>
      )
    }
  })())

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "summary", table_id: "t", name: "Summary", type: "text", config: JSON.stringify({ ai: { prompt: "Sum up the row", auto: true } }), position: 1 },
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 2 },
]
const row = (kept?: string[]): TableRow => ({ id: "r1", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "Booth", summary: "A booth", notes: "" }), ai_kept: kept })
const panel = (r: TableRow, onChange = vi.fn()) =>
  render(
    <RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[r]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={vi.fn()} onClose={vi.fn()} onChange={onChange} />,
  )

afterEach(() => {
  cleanup()
  fill.mockReset()
  toast.mockReset()
  confirm.mockReset()
  ledger.batchRows.mockReset()
  ledger.undoChange.mockReset()
  offers.length = 0
  ai.on = true
})

// TAB-BUG-4: a person's correction to an AI cell stays until someone asks the
// AI for it again, from the record.
// FIRST in this file: the row's comments come in their own chunk (next/dynamic, nothing while loading), so the sheet and
// its Comment are up before them; this case needs the chunk not yet in, as a page opening its first record has it.
describe("a press of the phone record's Comment before the row's comments are in", () => {
  // Their code loads first, in a hook: the stand-in's chunk, next/dynamic's, is still not in at the press.
  beforeAll(async () => {
    await realComments()
  })
  it("still brings their box into view as they come in (CR-260 PR3)", async () => {
    comments.real = await realComments()
    let scrolls = 0
    const scrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      if (this.matches("[data-row-comment-box]")) scrolls++
    }
    const off = putOnScreen(SCREENS["a phone in portrait"])
    try {
      const two: TableRow[] = [row(), { ...row(), id: "r2", position: 1 }]
      render(<RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={two} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />)
      const sheet = screen.getByRole("dialog", { name: "Booth, a row of Launch budget" })
      expect(document.querySelector("[data-row-comment-box]"), "PRECONDITION: the row's comments are not in yet").toBeNull()
      fireEvent.click(within(sheet.querySelector<HTMLElement>("[data-sheet-footer]")!).getByRole("button", { name: "Comment" }))
      await waitFor(() => expect(document.querySelector("[data-row-comment-box] .ProseMirror")).not.toBeNull())
      await act(() => new Promise((r) => setTimeout(r, 100)))
      expect(scrolls, "the press made before the comments were in brought their box into view").toBe(1)
      // CR-261 F4: and the caret, once their editor is in (it comes after them).
      expect(document.activeElement, "the press made before the comments were in put the caret in their box").toBe(document.querySelector("[data-row-comment-box] .ProseMirror"))
    } finally {
      comments.real = null
      Element.prototype.scrollIntoView = scrollIntoView
      off()
    }
  })
})

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
    render(<RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[lined]} rowId="r1" canManage commit={{ commitCell, linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />)
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
    // The record around it is far taller than the title, which has no border.
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "TEXTAREA" ? 64 : 900
    })
    const offset = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "TEXTAREA" ? 64 : 900
    })
    open()
    const title = screen.getByRole("textbox", { name: "Item" }) as HTMLTextAreaElement
    expect(title.style.height).toBe("64px")
    scroll.mockRestore()
    client.mockRestore()
    offset.mockRestore()
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
    render(<RecordPanel tableId="t" tableName="Launch budget" fields={[...fields, tags]} rows={[r]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />)
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
        commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }}
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

// Tables T5c: a view read in windows gives its count, and keeps the rows
// added here at its end (its tail). A record says its row's place in the
// whole view and steps by places, reading on as it nears the rows not read.
describe("a row's record in a view read in windows", () => {
  const lineRow = (i: number): TableRow => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item: `Line ${i}` }) })
  // Places 0 to 2 read, 3 to 8 on their way, and the row added here at place 9.
  const given = [lineRow(0), lineRow(1), lineRow(2), lineRow(99)]
  const open = (rowId: string, more: Partial<ComponentProps<typeof RecordPanel>> = {}) => {
    const onStep = vi.fn()
    render(
      <RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={given} count={10} tail={1} rowId={rowId} canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={onStep} onClose={vi.fn()} onChange={vi.fn()} {...more} />,
    )
    return onStep
  }
  const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement

  it("says its row's place in the whole view, and steps only to rows read", () => {
    const onStep = open("r2")
    expect(screen.getByText("Launch budget · 3 of 10")).toBeTruthy()
    fireEvent.click(button("Previous row (K)"))
    expect(onStep).toHaveBeenLastCalledWith("r1")
    // Place 3 is on its way: not the row added here, which is the view's last.
    expect(button("Next row (J)").disabled).toBe(true)
  })

  it("says a row added here is the view's last", () => {
    open("r99")
    expect(screen.getByText("Launch budget · 10 of 10")).toBeTruthy()
    expect(button("Next row (J)").disabled).toBe(true)
  })

  it("asks the view to read on to the next place", () => {
    const reach = vi.fn()
    open("r2", { onReach: reach })
    expect(reach).toHaveBeenCalledWith(3)
  })

  it("opens a row the view hasn't reached alone: no place, no steps", () => {
    open("r500", { rows: [lineRow(500)], count: undefined, tail: undefined, alone: true })
    expect(screen.getByText("Launch budget")).toBeTruthy()
    expect(screen.queryByText(/ of /)).toBeNull()
    expect(button("Previous row (K)").disabled).toBe(true)
    expect(button("Next row (J)").disabled).toBe(true)
  })
})

// REGRESSION-HUNT-1 (26 Oct): a record opened while an edit to its row was
// saving read the row's copy, and showed the old value until the save answered.
describe("a row's record opened while an edit to it saves", () => {
  it("shows the edit, not the row's copy", () => {
    const edits = new Map([["r1", { saving: { notes: "Bring a banner" }, saved: {}, copy: null, unsaved: {} }]])
    render(<RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[row()]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />)
    expect((screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement).value).toBe("Bring a banner")
  })
})

describe("a record for one who may only view the table (V-170)", () => {
  it("shows each field read-only with its value, and typing in one writes nothing", () => {
    const commitCell = vi.fn()
    render(
      <TableEditProvider value={false}>
        <RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[row()]} rowId="r1" canManage commit={{ commitCell, linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />
      </TableEditProvider>,
    )
    const box = (name: string) => screen.getByRole("textbox", { name }) as HTMLTextAreaElement | HTMLInputElement
    expect(box("Summary").value).toBe("A booth")
    for (const name of ["Summary", "Notes"]) expect(box(name).readOnly).toBe(true)
    fireEvent.change(box("Notes"), { target: { value: "Bring a banner" } })
    fireEvent.blur(box("Notes"))
    expect(commitCell).not.toHaveBeenCalled()
  })

  // CR-164 F1: Fill again writes the row's cell, which the server refuses a
  // viewer (403). The record reads whether its reader edits from the page, as
  // every writing surface does, and offers a viewer nothing to write with.
  const recordAs = (canEdit: boolean, r: TableRow) =>
    render(
      <TableEditProvider value={canEdit}>
        <RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[r]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />
      </TableEditProvider>,
    )

  it("offers a viewer no Fill again on an AI column, and still says a person wrote the cell", () => {
    recordAs(false, row(["summary"]))
    expect(screen.getByText("Written by a person, so AI leaves it be")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Fill again" })).toBeNull()
  })

  it("draws no AI note under a viewer's cell the AI wrote", () => {
    recordAs(false, row())
    expect(screen.getByRole("textbox", { name: "Summary" })).toBeTruthy()
    expect(document.querySelector("[data-ai-cell-note]")).toBeNull()
  })

  it("offers an editor Fill again, which fills the row's cell", async () => {
    fill.mockResolvedValue({ filled: 1, skipped: 0 })
    recordAs(true, row(["summary"]))
    expect(screen.getByText("Written by a person, so AI leaves it be")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fill again" })))
    expect(fill).toHaveBeenCalledWith("t", "summary", ["r1"])
  })
})

// CR-190's S5 and S5b (then caught by the e2e alone) and MUST 3: the record's delete enters the table's undo order,
// taken by its change set, and its toast's Undo goes the table's one Undo path (commit.undo), never straight to the ledger.
describe("a record's delete, in the table's undo order (V-360)", () => {
  function deleteHeld(undo = vi.fn(async () => undefined), press = true) {
    const order = new UndoOrder()
    let land!: (r: unknown) => void
    ledger.batchRows.mockReturnValueOnce(new Promise((r) => (land = r)))
    render(<RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={[row()]} rowId="r1" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: (w, s, o, t) => order.write(w, s, o, t), undo, edits: new Map() }} onStep={vi.fn()} onClose={vi.fn()} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete this row" }))
    const confirmed = (confirm.mock.calls[0][0] as { onConfirm: () => Promise<void> }).onConfirm()
    const aims: Aim[] = []
    const pressed = press ? order.press(async (aim) => void aims.push(aim)) : Promise.resolve()
    return { land, confirmed, pressed, aims, undo }
  }

  // V-381: the Ctrl+Z took it back already, so no toast offers it again (its Undo would answer 409 "undone already").
  it("is what a Ctrl+Z pressed on its way takes, by its change set, and then offers no toast", async () => {
    const d = deleteHeld()
    expect(ledger.batchRows).toHaveBeenCalledWith("t", { delete: ["r1"] })
    await act(async () => {
      d.land({ change_set: "c4", created: [], updated: [], deleted: ["r1"] })
      await d.confirmed
      await d.pressed
    })
    expect(d.aims).toEqual([{ kind: "set", set: "c4" }])
    expect(offers, "no toast for a delete the Ctrl+Z took back").toEqual([])
    expect(d.undo).not.toHaveBeenCalled()
    expect(ledger.undoChange, "never straight to the ledger").not.toHaveBeenCalled()
  })

  it("offers its toast when nothing took it on its way; the toast's Undo goes the one Undo path, by its change set", async () => {
    const d = deleteHeld(undefined, false)
    await act(async () => {
      d.land({ change_set: "c4", created: [], updated: [], deleted: ["r1"] })
      await d.confirmed
    })
    expect(offers.map((o) => o.title)).toEqual(["Row deleted"])
    await offers[0].undo()
    expect(d.undo).toHaveBeenCalledWith("c4")
    expect(ledger.undoChange, "never straight to the ledger").not.toHaveBeenCalled()
  })

  it("offers no Undo when the server stored nothing for it (someone else's delete got there first)", async () => {
    const d = deleteHeld()
    await act(async () => {
      d.land({ change_set: null, created: [], updated: [], deleted: [] })
      await d.confirmed
      await d.pressed
    })
    expect(d.aims).toEqual([{ kind: "none", what: "delete" }])
    expect(offers).toEqual([])
  })
})

// TABLES-BOARDS-25 (the phone pair, 10 Nov): on a phone the record was a panel
// of its own pinned to the foot of the screen, with six small buttons in its
// head, no grabber, no scrim and no swipe away. It is the shared sheet now
// (components/ui/drawer): the grabber, a swipe down or the scrim closes it;
// its head steps through the rows and closes it; Copy link and Delete are in
// its More menu; and its pinned footer holds Comment, in a thumb's reach.
describe("on a phone the record is the Drawer", () => {
  let off = () => {}
  afterEach(() => off())
  const two: TableRow[] = [row(), { ...row(), id: "r2", position: 1, values: JSON.stringify({ item: "Banner", summary: "", notes: "" }) }]
  const phone = (rowId: string, canManage = true) => {
    off = putOnScreen(SCREENS["a phone in portrait"])
    const onStep = vi.fn()
    const onClose = vi.fn()
    const at = (id: string) => <RecordPanel tableId="t" tableName="Launch budget" fields={fields} rows={two} rowId={id} canManage={canManage} commit={{ commitCell: vi.fn(), linkCell: vi.fn(), write: pass, undo: vi.fn(), edits: new Map() }} onStep={onStep} onClose={onClose} onChange={vi.fn()} />
    const { rerender } = render(at(rowId))
    const sheet = screen.getByRole("dialog", { name: `${rowId === "r1" ? "Booth" : "Banner"}, a row of Launch budget` })
    // The page hands the record the row stepped to (J/K, or a chevron in its head).
    return { sheet, onStep, onClose, stepTo: (id: string) => rerender(at(id)) }
  }
  const named = (el: Element, sel: string) => [...el.querySelectorAll(sel)].map((b) => b.getAttribute("aria-label") || b.textContent?.trim())

  it("opens in the shared sheet, with its grabber, and the record's own fields in it", () => {
    const { sheet } = phone("r1")
    expect(sheet.hasAttribute("data-v3-sheet"), "the shared Drawer's sheet").toBe(true)
    expect(sheet.hasAttribute("data-record-panel")).toBe(true)
    expect(sheet.querySelector("[data-drawer-handle]"), "its grabber").not.toBeNull()
    expect((screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement).value).toBe("")
  })

  it("steps and closes from its head; Copy link and Delete are in its More menu, not the head", async () => {
    const { sheet, onStep, onClose } = phone("r1")
    const head = sheet.querySelector("[data-sheet-header]")!
    expect(named(head, "button")).toEqual(["Previous row (K)", "Next row (J)", "More for this row", "Close"])
    fireEvent.click(screen.getByRole("button", { name: "Next row (J)" }))
    expect(onStep).toHaveBeenLastCalledWith("r2")
    const more = screen.getByRole("button", { name: "More for this row" })
    await act(async () => void fireEvent.keyDown(more, { key: "Enter" }))
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent?.trim())
    expect(items).toEqual(["Copy a link to this row", "Delete this row"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy a link to this row" }))
    expect(copy).toHaveBeenCalledWith(expect.stringContaining("row=r1"), expect.any(String))
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalled()
  })

  it("offers Delete in its More menu only to one who manages the table", async () => {
    phone("r2", false)
    const more = screen.getByRole("button", { name: "More for this row" })
    await act(async () => void fireEvent.keyDown(more, { key: "Enter" }))
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent?.trim())).toEqual(["Copy a link to this row"])
  })

  it("pins Comment in its footer, which starts a comment on the row", async () => {
    const { sheet } = phone("r1")
    await screen.findByTestId("row-comments")
    const foot = sheet.querySelector("[data-sheet-footer]")
    expect(foot, "a pinned footer").not.toBeNull()
    expect(named(foot!, "button")).toEqual(["Comment"])
    // The row's comments (their own chunk) are asked to bring their box up, for the whole row.
    expect(comments.props?.compose ?? 0).toBe(0)
    // A cell's comment chosen first: Comment lets go of it.
    fireEvent.click(screen.getByRole("button", { name: "Comment on Notes" }))
    expect(comments.props?.target).toBe("notes")
    fireEvent.click(screen.getByRole("button", { name: "Comment" }))
    expect(comments.props?.compose).toBe(1)
    expect(comments.props?.target, "the cell let go of").toBeNull()
  })

  it("opens the row stepped to after a press of Comment at its top: the press was the last row's", async () => {
    comments.real = await realComments()
    let scrolls = 0
    const scrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      if (this.matches("[data-row-comment-box]")) scrolls++
    }
    try {
      const { sheet, stepTo } = phone("r1")
      const box = () => document.querySelector("[data-row-comment-box] .ProseMirror")
      await waitFor(() => expect(box()).not.toBeNull())
      // The footer's Comment (the box has a Comment of its own, its send).
      fireEvent.click(within(sheet.querySelector<HTMLElement>("[data-sheet-footer]")!).getByRole("button", { name: "Comment" }))
      await waitFor(() => expect(document.activeElement).toBe(box()))
      expect(scrolls, "Comment brings the row's box into view").toBe(1)
      ;(document.activeElement as HTMLElement).blur()
      scrolls = 0
      // The sheet's body (it stays as the rows step) down at the box.
      const body = sheet.querySelector<HTMLElement>("[data-sheet-body]")!
      body.scrollTop = 400
      stepTo("r2")
      await screen.findByRole("dialog", { name: "Banner, a row of Launch budget" })
      expect(body.scrollTop, "the next row opens at its top").toBe(0)
      await waitFor(() => expect(box()).not.toBeNull())
      await act(() => new Promise((r) => setTimeout(r, 100)))
      expect(scrolls, "the next row's box scrolled to").toBe(0)
      expect(document.activeElement === box(), "the next row's box focused").toBe(false)
      // Back on the row pressed: its press went as the record left it.
      stepTo("r1")
      await screen.findByRole("dialog", { name: "Booth, a row of Launch budget" })
      await waitFor(() => expect(box()).not.toBeNull())
      await act(() => new Promise((r) => setTimeout(r, 100)))
      expect(scrolls, "the row pressed, stepped back to: its box scrolled to").toBe(0)
      expect(document.activeElement === box(), "the row pressed, stepped back to: its box focused").toBe(false)
    } finally {
      comments.real = null
      Element.prototype.scrollIntoView = scrollIntoView
    }
  })

  it("keeps an Escape typed in a field the field's; one from the sheet closes the record", async () => {
    const { sheet, onClose } = phone("r1")
    const notes = screen.getByRole("textbox", { name: "Notes" })
    notes.focus()
    fireEvent.keyDown(notes, { key: "Escape" })
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(onClose, "an Escape typed in Notes").not.toHaveBeenCalled()
    fireEvent.keyDown(sheet, { key: "Escape" })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("stays the side panel on a computer", () => {
    off = putOnScreen(SCREENS["a computer"])
    panel(row())
    const aside = document.querySelector("aside[data-record-panel]")
    expect(aside, "the panel beside the grid").not.toBeNull()
    expect(aside!.hasAttribute("data-v3-sheet")).toBe(false)
    expect(screen.getByRole("button", { name: "Copy a link to this row" })).toBeTruthy()
  })
})
