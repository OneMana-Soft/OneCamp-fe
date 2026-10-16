import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

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
    updateField: (...args: unknown[]) => updateField(...args),
    // Counted: a row that renders reads its values.
    parseRowValues: (r: Parameters<typeof real.parseRowValues>[0]) => {
      parsed(r.id)
      return real.parseRowValues(r)
    },
  }
})
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { DataTableGrid, groupedNumber } from "@/components/table/DataTableGrid"
import { optionColorClass } from "@/components/table/optionChip"
import type { TableField, TableRow } from "@/services/tableService"

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

  it("puts back what was saved on Escape", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const cell = screen.getAllByRole("textbox", { name: "Item" })[0] as HTMLInputElement
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
    const box = screen.getAllByRole("checkbox", { name: "Paid" })[1] as HTMLInputElement
    fireEvent.click(box)
    expect(box.checked).toBe(true)
    expect(patchRow).toHaveBeenCalledWith("t", "r1", { paid: true })
    await act(async () => fail(new Error("refused")))
    expect(box.checked).toBe(false)
  })

  it("saves what was typed in a cell whose row leaves the page while it has the focus", () => {
    patchRow.mockResolvedValue({})
    const { rerender } = render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const cell = screen.getAllByRole("textbox", { name: "Item" })[2]
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
    const item = screen.getAllByRole("textbox", { name: "Item" })[0]
    const cost = screen.getAllByRole("textbox", { name: "Cost" })[0]
    fireEvent.change(item, { target: { value: "Booth" } })
    await act(async () => fireEvent.blur(item))
    // The table has not come back yet when the second edit is saved.
    fireEvent.change(cost, { target: { value: "900" } })
    await act(async () => fireEvent.blur(cost))
    expect(patchRow).toHaveBeenNthCalledWith(1, "t", "r0", { item: "Booth" })
    expect(patchRow).toHaveBeenNthCalledWith(2, "t", "r0", { cost: 900 })
  })

  it("sends a row's edits one after another, so the last one made is the one kept", async () => {
    let first: (v: unknown) => void = () => {}
    patchRow.mockImplementationOnce(() => new Promise((resolve) => (first = resolve))).mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const item = screen.getAllByRole("textbox", { name: "Item" })[0]
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
    const [already, box] = screen.getAllByRole("checkbox", { name: "Paid" }) as HTMLInputElement[]
    expect(already.className).not.toMatch(/animate-spring/)
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

  it("draws a chosen option as a neutral chip with a dot in its hue, the way a guest sees it", () => {
    render(<DataTableGrid tableId="t" fields={typed} rows={one({ kind: "Events", tags: ["Urgent"] })} canManage onChange={() => {}} />)
    const chips = [...document.querySelectorAll("[data-option-chip]")] as HTMLElement[]
    const events = chips.find((c) => c.textContent === "Events")!
    for (const cls of optionColorClass("berry").split(" ")) expect(events.className).toContain(cls)
    expect(events.className).toContain("bg-hover")
    expect(events.querySelector("[data-chip-dot]")?.getAttribute("class")).toContain("hue-berry")
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
})


// TAB-BUG-8: a number cell saved what it couldn't read as nothing, wiping the
// cell ("€12", "12 kg", "TBD"), and read "1,5" as 15.
describe("typing into a number cell", () => {
  it("refuses what isn't a number: nothing is saved, the cell says so, and Escape puts the number back", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const cost = screen.getAllByRole("textbox", { name: "Cost" })[0] as HTMLInputElement
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
    const cost = screen.getAllByRole("textbox", { name: "Cost" })[0]
    fireEvent.change(cost, { target: { value: "€1,200" } })
    await act(async () => fireEvent.blur(cost))
    expect(patchRow).toHaveBeenCalledWith("t", "r0", { cost: 1200 })
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
})

// A column's save sent the page copy's position, name and config: a stale
// tab's rename put back a column someone had moved meanwhile.
describe("a column's save", () => {
  it("sends its name alone: it renames the column where it is now, as it is now", async () => {
    updateField.mockResolvedValue(undefined)
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(1)} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^Cost, Number column/ }))
    const name = screen.getByRole("textbox", { name: "Column name" })
    fireEvent.change(name, { target: { value: "Price" } })
    await act(async () => fireEvent.blur(name))
    expect(updateField).toHaveBeenCalledTimes(1)
    expect(updateField.mock.calls[0][2]).toEqual({ name: "Price" })
  })
})

// TAB-BUG-15 for checkboxes: every other cell took a click anywhere in it,
// and a checkbox only one on its 16 px box.
describe("a checkbox cell", () => {
  it("ticks on a click anywhere in the cell, and saves it", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(1)} canManage onChange={() => {}} />)
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
    const cell = screen.getByRole("textbox", { name: "Item" }) as HTMLTextAreaElement
    expect(cell.value).toBe("Para one\n\nPara two")
    cell.focus()
    fireEvent.change(cell, { target: { value: "Para one\n\nPara two (edited)" } })
    await act(async () => fireEvent.blur(cell))
    expect(patchRow).toHaveBeenCalledWith("t", "r0", { item: "Para one\n\nPara two (edited)" })
  })

  it("adds a line on Shift+Enter and on Alt+Enter, staying put, and saves on Enter", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={withText(["Above", "Notes"])} canManage onChange={() => {}} />)
    const cell = screen.getAllByRole("textbox", { name: "Item" })[1] as HTMLTextAreaElement
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
    const cell = screen.getAllByRole("textbox", { name: "Item" })[1] as HTMLTextAreaElement
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
    const [above, cell] = screen.getAllByRole("textbox", { name: "Item" }) as HTMLTextAreaElement[]
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
})
