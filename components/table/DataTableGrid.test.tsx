import { afterEach, describe, expect, it, vi, beforeAll } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

const patchRow = vi.fn()
const updateField = vi.fn()
const parsed = vi.fn()
// AI on, unless a test says otherwise (hooks/useClientConfig reads the server's config).
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/services/tableService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/tableService")>()
  return {
    ...real,
    patchRow: (...args: unknown[]) => patchRow(...args),
    // Counted: a row that renders reads its values.
    parseRowValues: (r: Parameters<typeof real.parseRowValues>[0]) => {
      parsed(r.id)
      return real.parseRowValues(r)
    },
  }
})
vi.mock("@/services/tableCalls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableCalls")>()),
  updateField: (...args: unknown[]) => updateField(...args),
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
// The real batch request, unless a test sends it somewhere of its own.
const batch = vi.hoisted(() => ({ rows: null as null | ((...args: unknown[]) => unknown) }))
vi.mock("@/lib/tables/ledger", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/tables/ledger")>()
  return { ...real, batchRows: (...args: Parameters<typeof real.batchRows>) => (batch.rows ? batch.rows(...args) : real.batchRows(...args)) }
})

import { DataTableGrid, LiveCells, SelectionPart, SummaryPart, groupedNumber } from "@/components/table/DataTableGrid"
import { optionColorClass } from "@/components/table/optionChip"
import type { TableField, TableRow } from "@/services/tableService"
import type { QuerySummaries } from "@/lib/querySpec/types"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"

// The column menus, the cell pickers are chunks of their own
// (lazyView): loaded once, before these tests, they draw at once.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm(), SummaryPart.warm(), LiveCells.warm(), SelectionPart.warm(), import("@/components/table/columnOps")]))

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
  { id: "paid", table_id: "t", name: "Paid", type: "checkbox", config: "{}", position: 2 },
]
function rowsOf(n: number): TableRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    table_id: "t",
    position: i,
    created_at: "",
    updated_at: "",
    values: JSON.stringify({ item: `Line ${i}`, cost: 100 + i, paid: false }),
  }))
}

afterEach(() => {
  cleanup()
  patchRow.mockReset()
  vi.useRealTimers()
})

/** A press on el by a mouse, a pen or a finger: jsdom has no PointerEvent to say which. */
function press(el: Element, pointerType: "mouse" | "pen" | "touch") {
  const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
  Object.defineProperty(down, "pointerType", { value: pointerType })
  el.dispatchEvent(down)
}

/**
 * A cell's control, live. The grid draws every cell at rest (restCell) but
 * the one in use, and brings a cell to life as a finger's press reaches it:
 * a test presses on it first, as a finger does.
 */
function live<T extends Element>(el: T): T {
  press(el, "touch")
  const id = el.getAttribute("data-cell")
  return ((id && document.querySelector(`[data-cell="${id}"]`)) || el) as T
}

// A fixed-layout table with every column a fixed width shares its spare
// room across all of them: a new table's one column began a third of the
// way across, behind a stretched row-number gutter. The last column (Add
// column, or nothing for a reader) takes the room instead.
describe("a narrow table's grid", () => {
  it.each([true, false])("gives its spare room to the last column (editor: %s)", (canManage) => {
    render(<DataTableGrid tableId="t" fields={fields.slice(0, 1)} rows={rowsOf(2)} canManage={canManage} onChange={() => {}} />)
    const cols = Array.from(document.querySelectorAll("colgroup col")) as HTMLElement[]
    expect(cols).toHaveLength(3)
    expect(cols.slice(0, -1).every((c) => c.style.width !== "")).toBe(true)
    expect(cols.at(-1)!.style.width).toBe("")
    // Every row reaches the last column, so its hairline and hover run edge to edge.
    for (const tr of Array.from(document.querySelectorAll("tbody tr:not([aria-hidden])"))) expect(tr.children).toHaveLength(3)
    expect(document.querySelector("thead tr")!.children).toHaveLength(3)
  })
})

describe("a big table's grid", () => {
  it("puts only a screenful of a thousand rows in the page", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(1000)} canManage onChange={() => {}} />)
    const shown = screen.getAllByRole("textbox", { name: "Item" })
    expect(shown.length).toBeGreaterThan(10)
    expect(shown.length).toBeLessThan(80)
    // The rows that are not in the page still take their space, so the
    // scrollbar is the length of the whole table.
    const spacer = document.querySelector("tbody tr[aria-hidden] td") as HTMLElement
    expect(parseInt(spacer.style.height, 10)).toBeGreaterThan(900 * 30)
  })

  it("moves down on ArrowDown and Enter, and left from the start of the text", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(20)} canManage onChange={() => {}} />)
    const items = screen.getAllByRole("textbox", { name: "Item" })
    const costs = screen.getAllByRole("textbox", { name: "Cost" })
    items[0].focus()
    fireEvent.keyDown(items[0], { key: "ArrowDown" })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1], { key: "Enter" })
    expect(document.activeElement).toBe(items[2])
    costs[2].focus()
    ;(costs[2] as HTMLInputElement).setSelectionRange(0, 0)
    fireEvent.keyDown(costs[2], { key: "ArrowLeft" })
    expect(document.activeElement).toBe(items[2])
  })

  // A box at rest (a cell the keys reached) is read-only with all of it
  // selected: there is no caret to move, so the arrows go across from it, as
  // from a spreadsheet's selected cell. A box in use keeps them for its caret.
  it("goes across from a box at rest whatever it has selected, and keeps the caret's arrows in a box in use", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const items = () => screen.getAllByRole("textbox", { name: "Item" }) as HTMLTextAreaElement[]
    const costs = () => screen.getAllByRole("textbox", { name: "Cost" }) as HTMLInputElement[]
    items()[1].focus()
    items()[1].select()
    fireEvent.keyDown(items()[1], { key: "ArrowRight" })
    expect(document.activeElement).toBe(costs()[1])
    costs()[1].select()
    fireEvent.keyDown(costs()[1], { key: "ArrowLeft" })
    expect(document.activeElement).toBe(items()[1])
    const box = live(items()[1])
    box.focus()
    box.setSelectionRange(2, 2)
    fireEvent.keyDown(box, { key: "ArrowRight" })
    expect(document.activeElement).toBe(box)
  })

  // A click, the keys down a row, and a word typed there: the mouse, resting
  // on the clicked cell, saw it drawn anew as the typed-in cell came to life
  // and brought it back to life, so the typed-in cell went to rest and took
  // the focus with it, and every key after the first was lost.
  it("keeps the cell being typed in when the mouse rests on another, which a press then opens", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const items = () => screen.getAllByRole("textbox", { name: "Item" }) as HTMLTextAreaElement[]
    fireEvent.pointerOver(items()[0])
    expect(items()[0].readOnly).toBe(false)
    items()[1].focus()
    fireEvent.keyDown(items()[1], { key: "Z" })
    const typing = items()[1]
    expect(typing.readOnly).toBe(false)
    expect(document.activeElement).toBe(typing)
    fireEvent.pointerOver(items()[0])
    expect(document.activeElement).toBe(typing)
    expect(items()[1].readOnly).toBe(false)
    expect(live(items()[0]).readOnly).toBe(false)
  })

  // A mouse's press is aimed as it goes down, and so is a pen's at a computer:
  // a cell it brought to life then was drawn anew under it, and the click went
  // nowhere (a status's picker never opened while another cell held the
  // focus). A cell the pointer left at rest opens by its click.
  it.each(["mouse", "pen"] as const)("opens by its click a cell a %s pressed while another held the focus", (pointerType) => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const items = () => screen.getAllByRole("textbox", { name: "Item" }) as HTMLTextAreaElement[]
    live(items()[0]).focus()
    const pressed = items()[1]
    fireEvent.pointerOver(pressed, { pointerType })
    press(pressed, pointerType)
    expect(items()[1]).toBe(pressed)
    fireEvent.click(pressed)
    expect(items()[1].readOnly).toBe(false)
    expect(document.activeElement).toBe(items()[1])
  })

  // The press put the caret in the box at rest, or a drag's selection; the
  // live box takes it, as a box the mouse came onto takes the press itself.
  // Its whole text was selected, so a word typed after the click replaced it.
  it("keeps the caret a mouse's press put in a cell it opened at rest", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const items = () => screen.getAllByRole("textbox", { name: "Item" }) as HTMLTextAreaElement[]
    live(items()[0]).focus()
    const pressed = items()[1]
    fireEvent.pointerOver(pressed, { pointerType: "mouse" })
    press(pressed, "mouse")
    // Where a browser's press puts the caret: jsdom puts none.
    pressed.setSelectionRange(2, 4)
    fireEvent.click(pressed, { detail: 1 })
    const opened = items()[1]
    expect(document.activeElement).toBe(opened)
    expect([opened.selectionStart, opened.selectionEnd]).toEqual([2, 4])
  })

  // The mouse coming onto the cell the keys are on leaves it as it is: brought
  // to life, its box would be drawn anew, and the focus would go with the old one.
  it("leaves the cell the keys are on as it is when the mouse comes onto it", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const items = () => screen.getAllByRole("textbox", { name: "Item" }) as HTMLTextAreaElement[]
    const resting = items()[2]
    resting.focus()
    fireEvent.pointerOver(resting)
    expect(document.activeElement).toBe(resting)
    expect(items()[2]).toBe(resting)
  })

  it("puts back what was saved on Escape", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const cell = live(screen.getAllByRole("textbox", { name: "Item" })[0]) as HTMLInputElement
    fireEvent.change(cell, { target: { value: "Typo" } })
    fireEvent.keyDown(cell, { key: "Escape" })
    expect(cell.value).toBe("Line 0")
    fireEvent.blur(cell)
    expect(patchRow).not.toHaveBeenCalled()
  })

  it("ticks a checkbox when it is clicked, before the save comes back, and unticks it if the save fails", async () => {
    let fail: (e: Error) => void = () => {}
    patchRow.mockImplementation(() => new Promise((_, reject) => (fail = reject)))
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const box = live(screen.getAllByRole("checkbox", { name: "Paid" })[1]) as HTMLInputElement
    fireEvent.click(box)
    expect(box.checked).toBe(true)
    expect(patchRow).toHaveBeenCalledWith("t", "r1", { paid: true })
    await act(async () => fail(new Error("refused")))
    expect(box.checked).toBe(false)
  })

  it("saves what was typed in a cell whose row leaves the page while it has the focus", () => {
    patchRow.mockResolvedValue({})
    const { rerender } = render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const cell = live(screen.getAllByRole("textbox", { name: "Item" })[2])
    cell.focus()
    fireEvent.change(cell, { target: { value: "Line 2, revised" } })
    // The row goes (filtered out, or scrolled out of the page) without a blur.
    rerender(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3).slice(0, 2)} canManage onChange={() => {}} />)
    expect(patchRow).toHaveBeenCalledWith("t", "r2", { item: "Line 2, revised" })
  })

  it("renders a row again only when its values change", () => {
    const rows = rowsOf(5)
    const { rerender } = render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    // The table comes back from the server: new objects, one value changed.
    const again = rows.map((r) => ({ ...r }))
    again[3] = { ...again[3], values: JSON.stringify({ item: "Changed", cost: 1, paid: true }) }
    parsed.mockClear()
    rerender(<DataTableGrid tableId="t" fields={fields} rows={again} canManage onChange={() => {}} />)
    expect(parsed.mock.calls.map((c) => c[0])).toEqual(["r3"])
  })
})

// TAB-BUG-1: a save sends its cell alone. A whole row sent from this reader's
// copy put back whatever another person had written in the row since.
describe("two quick edits to one row", () => {
  it("sends each cell alone, so neither save carries the other's copy of the row", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const item = live(screen.getAllByRole("textbox", { name: "Item" })[0])
    fireEvent.change(item, { target: { value: "Booth" } })
    await act(async () => fireEvent.blur(item))
    // The table has not come back yet when the second edit is saved.
    const cost = live(screen.getAllByRole("textbox", { name: "Cost" })[0])
    fireEvent.change(cost, { target: { value: "900" } })
    await act(async () => fireEvent.blur(cost))
    expect(patchRow).toHaveBeenNthCalledWith(1, "t", "r0", { item: "Booth" })
    expect(patchRow).toHaveBeenNthCalledWith(2, "t", "r0", { cost: 900 })
  })

  it("sends a row's edits one after another, so the last one made is the one kept", async () => {
    let first: (v: unknown) => void = () => {}
    patchRow.mockImplementationOnce(() => new Promise((resolve) => (first = resolve))).mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const item = live(screen.getAllByRole("textbox", { name: "Item" })[0])
    fireEvent.change(item, { target: { value: "Booth" } })
    await act(async () => fireEvent.blur(item))
    fireEvent.change(item, { target: { value: "Stand" } })
    await act(async () => fireEvent.blur(item))
    // The second waits for the first to be answered.
    expect(patchRow).toHaveBeenCalledTimes(1)
    await act(async () => first({}))
    expect(patchRow).toHaveBeenCalledTimes(2)
    expect(patchRow).toHaveBeenLastCalledWith("t", "r0", { item: "Stand" })
  })
})

describe("ticking a box in the grid", () => {
  it("springs the box that was ticked, and not one that was ticked when the table opened", () => {
    patchRow.mockResolvedValue({})
    const rows = rowsOf(2)
    rows[0] = { ...rows[0], values: JSON.stringify({ item: "Line 0", cost: 1, paid: true }) }
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    const [already, second] = screen.getAllByRole("checkbox", { name: "Paid" }) as HTMLInputElement[]
    expect(already.className).not.toMatch(/animate-spring/)
    const box = live(second)
    fireEvent.click(box)
    expect(box.className).toMatch(/animate-spring/)
    fireEvent.animationEnd(box)
    expect(box.className).not.toMatch(/animate-spring/)
  })
})

describe("a grid with no rows to show", () => {
  it("says so under the column names, and keeps New row right below", () => {
    render(
      <DataTableGrid tableId="t" fields={fields} rows={[]} canManage onChange={() => {}} empty={<p>No rows yet</p>} />,
    )
    expect(screen.getByRole("columnheader", { name: /Item/ })).toBeTruthy()
    const note = screen.getByText("No rows yet")
    const add = screen.getByRole("button", { name: /New row/ })
    expect(note.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows nothing extra once there are rows", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} empty={<p>No rows yet</p>} />)
    expect(screen.queryByText("No rows yet")).toBeNull()
  })
})

describe("a grid's cells at rest", () => {
  const typed: TableField[] = [
    { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
    { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
    { id: "due", table_id: "t", name: "Due", type: "date", config: "{}", position: 2 },
    { id: "kind", table_id: "t", name: "Kind", type: "select", config: JSON.stringify({ options: [{ label: "Events", color: "berry" }, { label: "Support" }] }), position: 3 },
    { id: "tags", table_id: "t", name: "Tags", type: "multi_select", config: JSON.stringify({ options: [{ label: "Urgent", color: "sun" }] }), position: 4 },
  ]
  const one = (values: Record<string, unknown>): TableRow[] => [
    { id: "r0", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "Booth", ...values }) },
  ]

  it("writes a date as the app does, from a button that opens the task panel's calendar", () => {
    render(<DataTableGrid tableId="t" fields={typed} rows={one({ due: "2026-10-07" })} canManage onChange={() => {}} />)
    expect(document.querySelector('input[type="date"]')).toBeNull()
    const due = screen.getByRole("button", { name: /^Due:/ })
    expect(due.textContent).toMatch(/^7 Oct( 2026)?$/)
    fireEvent.click(due)
    expect(screen.getByRole("grid")).toBeTruthy()
  })

  it("groups a number at rest as the formula beside it does, and keeps the digits to type in", () => {
    render(<DataTableGrid tableId="t" fields={typed} rows={one({ cost: 1200 })} canManage onChange={() => {}} />)
    const cost = screen.getByRole("textbox", { name: "Cost" }) as HTMLInputElement
    expect(cost.value).toBe("1200")
    const shown = cost.parentElement?.querySelector("span[aria-hidden]")
    expect(shown?.textContent).toBe((1200).toLocaleString(undefined, { maximumFractionDigits: 6 }))
    expect(cost.className).toMatch(/text-transparent/)
    expect(cost.className).toMatch(/focus:text-foreground/)
    expect(groupedNumber("6.5")).toBe((6.5).toLocaleString(undefined, { maximumFractionDigits: 6 }))
    expect(groupedNumber("12 boxes")).toBeNull()
  })

  // A table's first select is tinted until it says otherwise (optionChip
  // tintedFields): switched off, it is the neutral chip and dot.
  it("draws a chosen option as a neutral chip with a dot in its hue in a column switched off, the way a guest sees it", () => {
    const off = typed.map((f) => (f.id === "kind" ? { ...f, config: JSON.stringify({ ...JSON.parse(f.config), tinted: false }) } : f))
    render(<DataTableGrid tableId="t" fields={off} rows={one({ kind: "Events", tags: ["Urgent"] })} canManage onChange={() => {}} />)
    const chips = [...document.querySelectorAll("[data-option-chip]")] as HTMLElement[]
    const events = chips.find((c) => c.textContent === "Events")!
    for (const cls of optionColorClass("berry").split(" ")) expect(events.className).toContain(cls)
    expect(events.className).toContain("bg-hover")
    expect(events.querySelector("[data-chip-dot]")?.getAttribute("class")).toContain("hue-berry")
  })

  it("tints a table's first select by default, the column a board groups by, and not a multi-select", () => {
    render(<DataTableGrid tableId="t" fields={typed} rows={one({ kind: "Events", tags: ["Urgent"] })} canManage onChange={() => {}} />)
    const chips = [...document.querySelectorAll("[data-option-chip]")] as HTMLElement[]
    for (const cls of optionColorClass("berry", true).split(" ")) expect(chips.find((c) => c.textContent === "Events")!.className).toContain(cls)
    expect(chips.find((c) => c.textContent === "Urgent")!.className).not.toContain("bg-hue-tint")
  })

  it("tints a column's chips when the column opts in", () => {
    const tinted = typed.map((f) => (f.id === "kind" ? { ...f, config: JSON.stringify({ ...JSON.parse(f.config), tinted: true }) } : f))
    render(<DataTableGrid tableId="t" fields={tinted} rows={one({ kind: "Events", tags: ["Urgent"] })} canManage onChange={() => {}} />)
    const chips = [...document.querySelectorAll("[data-option-chip]")] as HTMLElement[]
    const events = chips.find((c) => c.textContent === "Events")!
    const urgent = chips.find((c) => c.textContent === "Urgent")!
    for (const cls of optionColorClass("berry", true).split(" ")) expect(events.className).toContain(cls)
    expect(urgent.className).not.toContain("bg-hue-tint")
  })
})

describe("the grid on the v3 sheet", () => {
  it("has one active-cell ring that moves to the focused cell", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const rings = document.querySelectorAll("[data-cell-ring]")
    expect(rings).toHaveLength(1)
    expect(rings[0].getAttribute("data-on")).toBe("false")
    fireEvent.focus(screen.getAllByRole("textbox", { name: "Item" })[1])
    expect(rings[0].getAttribute("data-on")).toBe("true")
    expect((rings[0] as HTMLElement).style.transform).toMatch(/^translate\(/)
  })

  // Someone's face, clicked (tables A7): the grid goes to the cell they're
  // on and selects it, its box shut, so two people never type in one cell
  // by a jump. Enter opens the box; the arrows move on.
  it("selects the cell asked for, shut, and opens it on Enter", () => {
    const onFocused = vi.fn()
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} focusRow="r2" selectField="cost" onFocused={onFocused} />)
    const box = () => screen.getAllByRole("textbox", { name: "Cost" })[2] as HTMLInputElement
    const cell = () => box().closest<HTMLElement>("[data-cell-box]")!
    expect(document.activeElement).toBe(cell())
    expect(onFocused).toHaveBeenCalledTimes(1)
    // Enter brings the cell to life and opens its box.
    fireEvent.keyDown(cell(), { key: "Enter" })
    expect(document.activeElement).toBe(box())
    expect(box().readOnly).toBe(false)
    // From a selected cell the arrows move on, as from a box at rest.
    act(() => cell().focus())
    fireEvent.keyDown(cell(), { key: "ArrowUp" })
    expect(document.activeElement).toBe(screen.getAllByRole("textbox", { name: "Cost" })[1])
  })

  it("freezes the primary column and ticks boxes in moss, never the brand", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const item = screen.getAllByRole("textbox", { name: "Item" })[0]
    expect(item.closest("td")?.hasAttribute("data-frozen")).toBe(true)
    expect(screen.getAllByRole("textbox", { name: "Cost" })[0].closest("td")?.hasAttribute("data-frozen")).toBe(false)
    const box = screen.getAllByRole("checkbox", { name: "Paid" })[0]
    expect(box.className).toContain("v3-check")
    expect(box.className).not.toMatch(/accent-|primary/)
  })

  it("selects rows from the gutter and offers a bulk bar", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    expect(screen.queryByRole("toolbar", { name: "Selected rows" })).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 2" }))
    expect(screen.getByRole("toolbar", { name: "Selected rows" }).textContent).toContain("1 row")
  })

  it("the bulk bar's Duplicate copies the rows selected in one request, from the bar's own chunk", async () => {
    const sent = vi.fn().mockResolvedValue({ change_set: "c1", created: [], updated: [], deleted: [] })
    batch.rows = sent
    try {
      const onChange = vi.fn()
      render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={onChange} />)
      fireEvent.click(screen.getByRole("checkbox", { name: "Select row 2" }))
      const bar = screen.getByRole("toolbar", { name: "Selected rows" })
      await act(async () => fireEvent.click(within(bar).getByRole("button", { name: "Duplicate" })))
      expect(sent).toHaveBeenCalledTimes(1)
      expect(sent).toHaveBeenCalledWith("t", { create: [{ values: { item: "Line 1", cost: 101, paid: false } }] })
      expect(onChange).toHaveBeenCalled()
      expect(screen.queryByRole("toolbar", { name: "Selected rows" })).toBeNull()
    } finally {
      batch.rows = null
    }
  })

  it("sums numbers and counts ticks in the summary bar", () => {
    const rows = rowsOf(3)
    rows[0] = { ...rows[0], values: JSON.stringify({ item: "a", cost: 100, paid: true }) }
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} summary={{}} onSummary={() => {}} />)
    const bar = document.querySelector("[data-summary-bar]") as HTMLElement
    expect(bar.textContent).toContain("Sum")
    expect(bar.textContent).toContain(`${(100 + 101 + 102).toLocaleString()}`)
    expect(bar.textContent).toContain("1 of 3")
  })

  it("writes a formula's error as #ERROR, with the reason for assistive tech", () => {
    const f: TableField[] = [
      fields[0],
      { id: "bad", table_id: "t", name: "Bad", type: "formula", config: JSON.stringify({ formula: "{Gone}", result: "number" }), position: 1 },
    ]
    const r: TableRow[] = [{ id: "r0", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "a", bad: { error: "No field called Gone" } }) }]
    render(<DataTableGrid tableId="t" fields={f} rows={r} canManage onChange={() => {}} />)
    expect(screen.getByText("#ERROR")).toBeTruthy()
    expect(screen.getByText("No field called Gone").className).toContain("sr-only")
  })

  // A broken rollup's card, and the pointer that comes to its cell and goes.
  const brokenRollup = () => {
    const why = "A rollup can't add up rollups that add each other up"
    const f: TableField[] = [
      fields[0],
      { id: "sum", table_id: "t", name: "Sum", type: "rollup", config: JSON.stringify({ relation: "vendor", field: "vspend", aggregate: "sum", result: "number" }), position: 1 },
    ]
    const r: TableRow[] = [{ id: "r0", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "a", sum: { error: why } }) }]
    render(<DataTableGrid tableId="t" fields={f} rows={r} canManage onChange={() => {}} />)
    // Found afresh each time: the first opening draws the cell again, inside its popover.
    const face = () => screen.getByText("#ERROR").parentElement as HTMLElement
    const pointer = (type: "pointerover" | "pointerout", pointerType: "mouse" | "touch") => {
      const e = new MouseEvent(type, { bubbles: true, relatedTarget: null })
      Object.defineProperty(e, "pointerType", { value: pointerType })
      face().dispatchEvent(e)
    }
    return { why, face, pointer }
  }

  // A tap ends with the finger leaving (pointerup, then pointerout and
  // pointerleave), and that leave shut the card 160 ms after the tap opened
  // it, so on a phone its "Edit rollup" could never be pressed.
  it("keeps a broken cell's card up after a finger's tap, which ends with the finger leaving", () => {
    vi.useFakeTimers()
    const { why, face, pointer } = brokenRollup()
    act(() => {
      pointer("pointerover", "touch")
      pointer("pointerout", "touch")
      face().focus()
    })
    act(() => vi.advanceTimersByTime(1000))
    const card = screen.getByRole("note")
    expect(card.textContent).toContain(why)
    expect(within(card).getByRole("button", { name: "Edit rollup" })).toBeTruthy()
  })

  it("still opens a broken cell's card while a mouse rests on it, and puts it away when the mouse leaves", () => {
    vi.useFakeTimers()
    const { why, pointer } = brokenRollup()
    act(() => pointer("pointerover", "mouse"))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole("note").textContent).toContain(why)
    act(() => pointer("pointerout", "mouse"))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole("note")).toBeNull()
  })

  // On a phone the card is a sheet, and a sheet's actions stand pinned at its
  // foot (app/overlay.css): its words are the body, its button the footer.
  it("lays a broken cell's card out as every overlay is: its words in the body, its button in the footer", () => {
    const { why, face } = brokenRollup()
    act(() => face().focus())
    const card = screen.getByRole("note")
    expect(card.querySelector("[data-overlay-body]")?.textContent).toContain(why)
    expect(card.querySelector("[data-overlay-footer] button")?.textContent).toBe("Edit rollup")
  })
})


// TAB-BUG-8: a number cell saved what it couldn't read as nothing, wiping the
// cell ("€12", "12 kg", "TBD"), and read "1,5" as 15.
describe("typing into a number cell", () => {
  it("refuses what isn't a number: nothing is saved, the cell says so, and Escape puts the number back", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const cost = live(screen.getAllByRole("textbox", { name: "Cost" })[0]) as HTMLInputElement
    fireEvent.change(cost, { target: { value: "12 kg" } })
    await act(async () => fireEvent.blur(cost))
    expect(patchRow).not.toHaveBeenCalled()
    expect(cost.getAttribute("aria-invalid")).toBe("true")
    expect(cost.parentElement?.getAttribute("title")).toBe("Not a number")
    fireEvent.keyDown(cost, { key: "Escape" })
    expect(cost.value).toBe("100")
    expect(cost.getAttribute("aria-invalid")).toBeNull()
  })

  it("reads a currency sign and digit groups", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const cost = live(screen.getAllByRole("textbox", { name: "Cost" })[0])
    fireEvent.change(cost, { target: { value: "€1,200" } })
    await act(async () => fireEvent.blur(cost))
    expect(patchRow).toHaveBeenCalledWith("t", "r0", { cost: 1200 })
  })
})

// A4's should-fix (DB-29, 29 Oct): on a phone a row's selection bar floats
// over the rows, 8 px over the summary bar, and the last row couldn't scroll
// clear of it. While rows are selected over a summary bar, the rows end with
// room for the bar (its height, table.css); a computer's CSS hides it.
describe("rows selected over a summary bar", () => {
  it("end the rows with room for the selection bar, until none is selected", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} summary={{}} onSummary={() => {}} />)
    expect(document.querySelector("[data-float-room]")).toBeNull()
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    expect(document.querySelector("tbody > tr:last-child[data-float-room]"), "the rows' last").toBeTruthy()
    expect(document.querySelector("[data-float-over-sums] [data-selection-float]")).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    expect(document.querySelector("[data-float-room]")).toBeNull()
  })

  it("leave no room without a summary bar, where the bar floats on the New row line", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    expect(document.querySelector("[data-selection-float]")).toBeTruthy()
    expect(document.querySelector("[data-float-room]")).toBeNull()
    expect(document.querySelector("[data-float-over-sums]")).toBeNull()
  })
})

// The W0 audit (39213924's row): a 1,200-row budget's summary bar summed its
// first 500 rows, unmarked.
describe("a summary of the rows loaded alone", () => {
  it("says it's of those rows", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} summary={{}} onSummary={() => {}} loaded={500} />)
    expect(screen.getByRole("button", { name: /^Cost summary: Sum of 500 loaded/ })).toBeTruthy()
    cleanup()
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} summary={{}} onSummary={() => {}} />)
    expect(screen.getByRole("button", { name: /^Cost summary: Sum 303/ })).toBeTruthy()
  })

  it("says the whole view's once the server has summed every row the view keeps", () => {
    const served = { "field:cost": { sum: 125000 }, "field:paid": { checked: 40, count: 1200 } }
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} summary={{}} onSummary={() => {}} loaded={500} served={served} />)
    expect(screen.getByRole("button", { name: "Cost summary: Sum 125,000" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Paid summary: Checked 40 of 1200" })).toBeTruthy()
  })

  // DB-22: a view read in windows showed its loaded rows' partial sum, which
  // jumped to the whole as the server answered.
  it("says \"Sum …\" while the server's sums of a view read in windows are on their way, never the loaded rows' partial", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} summary={{}} onSummary={() => {}} loaded={500} served={null} />)
    expect(screen.getByRole("button", { name: "Cost summary: Sum …" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Paid summary: Checked …" })).toBeTruthy()
  })

  it("says a column is of the rows loaded until the server has summed it the reader's way", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} summary={{ cost: "average" }} onSummary={() => {}} loaded={500} served={{ "field:cost": { sum: 125000 } }} />)
    expect(screen.getByRole("button", { name: /^Cost summary: Average of 500 loaded 101/ })).toBeTruthy()
  })
})

// A column's save sent the page copy's position, name and config: a stale
// tab's rename put back a column someone had moved meanwhile.
// airtable-03 (main's call, 29 Oct): in a view read in windows a formula's or
// a rollup's summary is the server's alone, over every row the reader may
// see; never its loaded rows' partial, which a stored field's falls back to.
describe("a formula's summary in a view read in windows", () => {
  const withCalc: TableField[] = [...fields, { id: "calc", table_id: "t", name: "Calc", type: "formula", config: JSON.stringify({ formula: "{Cost} * 2", result: "number" }), position: 3 }]
  const why = "This table has too many rows to work out a formula or a rollup over all of them yet"
  const grid = (served: QuerySummaries | null | undefined, more: { windowed?: boolean; refusedSums?: { why: string; fields: string[] }; sumsOut?: string } = {}) =>
    render(<DataTableGrid tableId="t" fields={withCalc} rows={rowsOf(3)} canManage onChange={() => {}} summary={{}} onSummary={() => {}} loaded={500} served={served} windowed={more.windowed ?? true} refusedSums={more.refusedSums} sumsOut={more.sumsOut} />)

  it("says \"Sum …\" until the server's comes, then the server's over every row, and never its loaded rows' partial", () => {
    grid({ "field:cost": { sum: 125000 } })
    expect(screen.getByRole("button", { name: "Calc summary: Sum …" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cost summary: Sum 125,000" })).toBeTruthy()
    cleanup()
    grid({ "field:cost": { sum: 125000 }, "field:calc": { sum: 250000 } })
    expect(screen.getByRole("button", { name: "Calc summary: Sum 250,000" })).toBeTruthy()
    cleanup()
    // The view's read failed, or its sums were left out: a stored field's falls back to its loaded rows', a formula's waits.
    grid(undefined)
    expect(screen.getByRole("button", { name: /^Cost summary: Sum of 500 loaded/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Calc summary: Sum …" })).toBeTruthy()
  })

  it("says why in the server's words when the server won't work it out", () => {
    grid({ "field:cost": { sum: 125000 } }, { refusedSums: { why, fields: ["field:calc"] } })
    const calc = screen.getByRole("button", { name: `Calc summary: Sum –. ${why}` })
    expect(calc.getAttribute("data-tip")).toBe(why)
    expect(calc.textContent).not.toMatch(/loaded/)
  })

  // V-118: once the server's last re-ask left the sums out too, the bar said
  // "Sum …" for good. A formula's says why; a stored field's is its loaded
  // rows', as when its sums are left out; one the server refused keeps its words.
  it("says why, never \"Sum …\" for good, once the last re-ask left the sums out", () => {
    const out = "The rows take too long to add up right now: filter the view to fewer rows."
    grid(undefined, { sumsOut: out })
    const calc = screen.getByRole("button", { name: `Calc summary: Sum –. ${out}` })
    expect(calc.getAttribute("data-tip")).toBe(out)
    expect(screen.getByRole("button", { name: /^Cost summary: Sum of 500 loaded/ })).toBeTruthy()
    cleanup()
    grid(undefined, { sumsOut: out, refusedSums: { why, fields: ["field:calc"] } })
    expect(screen.getByRole("button", { name: `Calc summary: Sum –. ${why}` })).toBeTruthy()
  })

  it("keeps its loaded rows' partial in a view read in the browser, as a stored field's", () => {
    grid(undefined, { windowed: false })
    expect(screen.getByRole("button", { name: /^Calc summary: Sum of 500 loaded/ })).toBeTruthy()
  })

  // CR-92 M2: a summary its kind no longer offers (a sum kept on a formula
  // edited to give text) is never asked of the server, so it never waits
  // for the server's: it is the loaded rows', as a stored field's.
  it("never waits for a summary the server isn't asked for, as a sum kept on a formula that now gives text", () => {
    const toText = withCalc.map((f) => (f.id === "calc" ? { ...f, config: JSON.stringify({ formula: "{Cost} & \" USD\"", result: "text" }) } : f))
    render(<DataTableGrid tableId="t" fields={toText} rows={rowsOf(3)} canManage onChange={() => {}} summary={{ calc: "sum" }} onSummary={() => {}} loaded={500} served={{ "field:cost": { sum: 125000 } }} windowed />)
    expect(screen.queryByRole("button", { name: /^Calc summary: Sum …/ })).toBeNull()
    expect(screen.getByRole("button", { name: /^Calc summary: Sum of 500 loaded/ })).toBeTruthy()
  })
})

describe("a column's save", () => {
  it("sends its name alone: it renames the column where it is now, as it is now", async () => {
    updateField.mockResolvedValue(undefined)
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(1)} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^Cost, Number column/ }))
    const name = screen.getByRole("textbox", { name: "Column name" })
    fireEvent.change(name, { target: { value: "Price" } })
    await act(async () => fireEvent.blur(name))
    // From the columns' own chunk (columnOps), a moment later.
    await vi.waitFor(() => expect(updateField).toHaveBeenCalledTimes(1))
    expect(updateField.mock.calls[0][2]).toEqual({ name: "Price" })
  })
})

// TAB-BUG-15 for checkboxes: every other cell took a click anywhere in it,
// and a checkbox only one on its 16 px box.
describe("a checkbox cell", () => {
  it("ticks on a click anywhere in the cell, and saves it", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(1)} canManage onChange={() => {}} />)
    // A press anywhere in the cell brings it to life, as a finger's does.
    press(screen.getByRole("checkbox", { name: "Paid" }).closest("td")!.firstElementChild!, "touch")
    const box = screen.getByRole("checkbox", { name: "Paid" }) as HTMLInputElement
    const cell = box.closest("td")!.firstElementChild as HTMLElement
    expect(cell).not.toBe(box)
    await act(async () => fireEvent.click(cell))
    expect(box.checked).toBe(true)
    expect(patchRow).toHaveBeenCalledWith("t", "r0", { paid: true })
  })
})

// TAB-BUG-7: a text cell was an input, which drops line breaks: a value with
// lines showed them run together, and the first edit saved it that way.
describe("a text cell's lines", () => {
  const withText = (texts: string[]): TableRow[] =>
    texts.map((item, i) => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item, cost: i, paid: false }) }))

  it("keeps its line breaks through the focus, typing and a save", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={withText(["Para one\n\nPara two"])} canManage onChange={() => {}} />)
    const cell = live(screen.getByRole("textbox", { name: "Item" })) as HTMLTextAreaElement
    expect(cell.value).toBe("Para one\n\nPara two")
    cell.focus()
    fireEvent.change(cell, { target: { value: "Para one\n\nPara two (edited)" } })
    await act(async () => fireEvent.blur(cell))
    expect(patchRow).toHaveBeenCalledWith("t", "r0", { item: "Para one\n\nPara two (edited)" })
  })

  it("adds a line on Shift+Enter and on Alt+Enter, staying put, and saves on Enter", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={withText(["Above", "Notes"])} canManage onChange={() => {}} />)
    const cell = live(screen.getAllByRole("textbox", { name: "Item" })[1]) as HTMLTextAreaElement
    cell.focus()
    cell.setSelectionRange(5, 5)
    fireEvent.keyDown(cell, { key: "Enter", shiftKey: true })
    expect(cell.value).toBe("Notes\n")
    expect(document.activeElement).toBe(cell)
    fireEvent.keyDown(cell, { key: "Enter", altKey: true })
    expect(cell.value).toBe("Notes\n\n")
    // The last row: Enter saves where it is.
    await act(async () => fireEvent.keyDown(cell, { key: "Enter" }))
    expect(document.activeElement).not.toBe(cell)
    expect(patchRow).toHaveBeenCalledWith("t", "r1", { item: "Notes\n\n" })
  })

  // Safari confirms an input method's word (Japanese, Chinese) with an Enter
  // whose keyCode is 229 and isComposing false: it saved the cell mid-word.
  it("leaves an input method's Enter to it: the cell neither saves nor moves", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={withText(["Above", "Notes", "Below"])} canManage onChange={() => {}} />)
    const cell = live(screen.getAllByRole("textbox", { name: "Item" })[1]) as HTMLTextAreaElement
    cell.focus()
    fireEvent.change(cell, { target: { value: "Notes にほんご" } })
    await act(async () => fireEvent.keyDown(cell, { key: "Enter", keyCode: 229 }))
    expect(document.activeElement).toBe(cell)
    expect(patchRow).not.toHaveBeenCalled()
    // An input cell's Enter goes to the grid's keys, which leave it too.
    const cost = screen.getAllByRole("textbox", { name: "Cost" })[1]
    cost.focus()
    await act(async () => fireEvent.keyDown(cost, { key: "Enter", keyCode: 229 }))
    expect(document.activeElement).toBe(cost)
  })

  it("moves up and down through its lines before it moves a row", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={withText(["Above", "One\nTwo", "Below"])} canManage onChange={() => {}} />)
    const [above, resting] = screen.getAllByRole("textbox", { name: "Item" }) as HTMLTextAreaElement[]
    // In use: a box at rest has no caret to move through its lines.
    const cell = live(resting)
    cell.focus()
    cell.setSelectionRange(5, 5)
    fireEvent.keyDown(cell, { key: "ArrowUp" })
    expect(document.activeElement).toBe(cell)
    cell.setSelectionRange(1, 1)
    fireEvent.keyDown(cell, { key: "ArrowUp" })
    expect(document.activeElement).toBe(above)
  })

  it("edits a URL holding a line break whole, saying Edit in full, rather than in an input that drops it", () => {
    const withUrl: TableField[] = [fields[0], { id: "site", table_id: "t", name: "Site", type: "url", config: "{}", position: 1 }]
    const rows: TableRow[] = [{ id: "r0", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "a", site: "https://a.example\nhttps://b.example" }) }]
    render(<DataTableGrid tableId="t" fields={withUrl} rows={rows} canManage onChange={() => {}} />)
    const site = screen.getByRole("textbox", { name: "Site" }) as HTMLTextAreaElement
    expect(site.tagName).toBe("TEXTAREA")
    expect(site.value).toBe("https://a.example\nhttps://b.example")
    expect(site.parentElement?.textContent).toContain("Edit in full")
  })

  // DB-25 (28 Oct): a URL cell that doesn't link read in a link's colour, and underlined under the pointer.
  it("draws a URL cell as a link only when it links: another kind of address is ink, with its invalid mark", () => {
    const withUrl: TableField[] = [fields[0], { id: "site", table_id: "t", name: "Site", type: "url", config: "{}", position: 1 }]
    const at = (i: number, site: string): TableRow => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item: `v${i}`, site }) })
    render(<DataTableGrid tableId="t" fields={withUrl} rows={[at(0, "example.com/board"), at(1, "mailto:team@example.com")]} canManage onChange={() => {}} />)
    expect(screen.getByText("example.com").className).toMatch(/text-brand-text.*group-hover\/cell:underline/)
    const mail = screen.getByText("mailto:team@example.com")
    expect(mail.className).not.toMatch(/text-brand-text|underline/)
    expect(mail.closest("[data-cell-box]")?.className).toContain("ring-destructive")
  })
})

// A row people are talking about carries a mark, and its open button says how
// many comments its open threads hold (tables A8).
describe("a row with comments in the grid", () => {
  it("is marked, and its open button counts its comments", () => {
    const rows = rowsOf(2)
    rows[1] = { ...rows[1], comments: 3 }
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} onOpenRow={() => {}} />)
    expect(document.querySelectorAll("[data-row-comments]")).toHaveLength(1)
    expect(document.querySelector('[data-row-comments="3"]')?.getAttribute("title")).toBe("3 comments")
    expect(screen.getByRole("button", { name: "Open row 2, 3 comments" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open row 1" })).toBeTruthy()
  })
})

// A row with a page of its own carries a page mark, and its open button says
// so (tables T2, rows as pages).
describe("a row with a page in the grid", () => {
  it("is marked, and its open button says it has a page", () => {
    const rows = rowsOf(3)
    rows[0] = { ...rows[0], page: "d1" }
    rows[2] = { ...rows[2], page: "d2", comments: 1 }
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} onOpenRow={() => {}} />)
    expect(document.querySelectorAll("[data-row-page]")).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Open row 1, which has a page" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open row 2" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open row 3, 1 comment, which has a page" })).toBeTruthy()
  })
})

// REGRESSION-HUNT-1 (26 Oct): a cell left for another is drawn at rest again,
// from the row's copy, so what was typed showed the old value until the save
// answered: Cost 1200 typed as 1207 read 1200 for the whole 2.6 s save.
describe("a cell left while its save is on its way", () => {
  const costBox = () => screen.getAllByRole("textbox", { name: "Cost" })[0] as HTMLInputElement
  async function typeAndLeave() {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const cost = live(costBox())
    fireEvent.change(cost, { target: { value: "1207" } })
    await act(async () => fireEvent.blur(cost))
    // Another cell comes to life, and this one is drawn at rest again.
    live(screen.getAllByRole("textbox", { name: "Item" })[1])
    expect(costBox().closest("td")!.querySelector("[data-rest]")).not.toBeNull()
  }

  it("shows what was typed at once, as saving, until the save answers", async () => {
    let answer: (v: unknown) => void = () => {}
    patchRow.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    await typeAndLeave()
    expect(costBox().value).toBe("1207")
    expect(costBox().closest("td")!.getAttribute("aria-busy")).toBe("true")
    await act(async () => answer({}))
    expect(costBox().value).toBe("1207")
    expect(costBox().closest("td")!.hasAttribute("aria-busy")).toBe(false)
  })

  it("goes back to what was saved when the save fails", async () => {
    let fail: (e: Error) => void = () => {}
    patchRow.mockImplementation(() => new Promise((_, reject) => (fail = reject)))
    await typeAndLeave()
    expect(costBox().value).toBe("1207")
    await act(async () => fail(new Error("refused")))
    expect(costBox().value).toBe("100")
    expect(costBox().closest("td")!.hasAttribute("aria-busy")).toBe(false)
  })
})
