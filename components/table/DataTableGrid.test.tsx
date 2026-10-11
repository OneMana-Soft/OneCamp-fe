import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const updateRow = vi.fn()
const parsed = vi.fn()
vi.mock("@/services/tableService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/tableService")>()
  return {
    ...real,
    updateRow: (...args: unknown[]) => updateRow(...args),
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
  updateRow.mockReset()
  vi.useRealTimers()
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
    expect(updateRow).not.toHaveBeenCalled()
  })

  it("ticks a checkbox when it is clicked, before the save comes back, and unticks it if the save fails", async () => {
    let fail: (e: Error) => void = () => {}
    updateRow.mockImplementation(() => new Promise((_, reject) => (fail = reject)))
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const box = screen.getAllByRole("checkbox", { name: "Paid" })[1] as HTMLInputElement
    fireEvent.click(box)
    expect(box.checked).toBe(true)
    expect(updateRow).toHaveBeenCalledWith("t", "r1", expect.objectContaining({ paid: true }), 1)
    await act(async () => fail(new Error("refused")))
    expect(box.checked).toBe(false)
  })

  it("saves what was typed in a cell whose row leaves the page while it has the focus", () => {
    updateRow.mockResolvedValue({})
    const { rerender } = render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={() => {}} />)
    const cell = screen.getAllByRole("textbox", { name: "Item" })[2]
    cell.focus()
    fireEvent.change(cell, { target: { value: "Line 2, revised" } })
    // The row goes (filtered out, or scrolled out of the page) without a blur.
    rerender(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3).slice(0, 2)} canManage onChange={() => {}} />)
    expect(updateRow).toHaveBeenCalledWith("t", "r2", expect.objectContaining({ item: "Line 2, revised" }), 2)
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

describe("two quick edits to one row", () => {
  it("carries the first into the second's save, so it is not put back", async () => {
    updateRow.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={() => {}} />)
    const item = screen.getAllByRole("textbox", { name: "Item" })[0]
    const cost = screen.getAllByRole("textbox", { name: "Cost" })[0]
    fireEvent.change(item, { target: { value: "Booth" } })
    await act(async () => fireEvent.blur(item))
    // The table has not come back yet when the second edit is saved.
    fireEvent.change(cost, { target: { value: "900" } })
    await act(async () => fireEvent.blur(cost))
    expect(updateRow).toHaveBeenLastCalledWith("t", "r0", expect.objectContaining({ item: "Booth", cost: 900 }), 0)
  })
})

describe("ticking a box in the grid", () => {
  it("springs the box that was ticked, and not one that was ticked when the table opened", () => {
    updateRow.mockResolvedValue({})
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

