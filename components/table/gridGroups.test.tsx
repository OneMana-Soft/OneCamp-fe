import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"

vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { DataTableGrid, GroupPart, LiveCells, SummaryPart } from "@/components/table/DataTableGrid"
import type { GroupRule } from "@/lib/tables/viewRules"
import type { TableField, TableRow } from "@/services/tableService"

// Tables V2b: a grouped grid draws a header for each group (its value, how
// many rows it holds and its totals under the columns) above its rows, and
// leaves out the rows of the groups the reader collapsed.

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ label: "Won", color: "green" }, { label: "Lost", color: "red" }] }), position: 1 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 2 },
]
const row = (i: number, stage: string): TableRow => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item: `Line ${i}`, stage, cost: 100 + i }) })
// Held in the browser, in the groups' order: Won holds 3, Lost 2.
const rows = [row(0, "Won"), row(1, "Won"), row(2, "Won"), row(3, "Lost"), row(4, "Lost")]
const levels: GroupRule[] = [{ field: "stage", dir: "asc" }]
const held = [
  { key: ["Won"], count: 3, from: 0 },
  { key: ["Lost"], count: 2, from: 3 },
]

function grid(over: Partial<ComponentProps<typeof DataTableGrid>> = {}, shut: string[][] = [], onShut = vi.fn()) {
  return render(
    <DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} summary={{}} grouping={{ levels, counts: held, shut, onShut }} {...over} />,
  )
}
const headers = () => [...document.querySelectorAll("tbody tr[data-group-header]")] as HTMLElement[]
const bodyRows = () => [...document.querySelectorAll("tbody tr[data-row]")].map((r) => r.getAttribute("data-row"))

afterEach(cleanup)

describe("a grouped grid", () => {
  it("waits, busy, drawing none of its rows ungrouped, until its headers' chunk is in", async () => {
    grid()
    expect(bodyRows()).toEqual([])
    expect(document.querySelector("table")?.getAttribute("aria-busy")).toBe("true")
    await act(() => GroupPart.warm())
    expect(bodyRows()).toEqual(["r0", "r1", "r2", "r3", "r4"])
  })

  it("says a header's count and totals are of its rows loaded while the browser holds only part of the table, never as all its rows", async () => {
    await Promise.all([GroupPart.warm(), SummaryPart.warm(), LiveCells.warm()])
    // A table read in the browser that holds only part of its rows (its index not whole yet, past the rows it holds).
    grid({ grouping: { levels, counts: held, shut: [], onShut: vi.fn(), partial: true } })
    const won = headers()[0]
    // The chip's words are in the toggle's name.
    expect(within(won).getByRole("button", { name: "Collapse Stage: Won, 3 loaded" })).toBeTruthy()
    expect(won.querySelector("[data-group-count]")?.textContent).toBe("3 loaded")
    // AA on the top level's band in light: ink-2 on the pill, never ink-3 (4.28:1, DB-24).
    expect(won.querySelector("[data-group-count]")?.className).toMatch(/\btext-ink-2\b/)
    expect(won.querySelector("[data-group-count]")?.className).not.toMatch(/\btext-ink-3\b/)
    // The band's totals show as ever; a screen reader hears they're of the group's rows loaded.
    const sum = won.querySelector('[data-field="cost"]')
    expect(sum?.textContent).toBe("Sum of the 3 loaded 303")
    expect(sum?.querySelector(".sr-only")?.textContent).toBe(" of the 3 loaded ")
    expect(headers()[1].querySelector('[data-field="cost"]')?.textContent).toBe("Sum of the 2 loaded 207")
  })

  it("draws each group's value, its count and its totals above its rows", async () => {
    await Promise.all([GroupPart.warm(), SummaryPart.warm(), LiveCells.warm()])
    grid()
    expect(headers()).toHaveLength(2)
    const won = headers()[0]
    expect(within(won).getByRole("button", { name: "Collapse Stage: Won, 3 rows" }).getAttribute("aria-expanded")).toBe("true")
    expect(won.textContent).toContain("Won")
    // The cost column's sum over Won's rows, as the summary bar sums it.
    expect(won.querySelector('[data-field="cost"]')?.textContent).toContain("303")
    expect(headers()[1].querySelector('[data-field="cost"]')?.textContent).toContain("207")
    expect([...document.querySelectorAll("tbody tr[data-group-header], tbody tr[data-row]")].map((r) => r.getAttribute("data-row") ?? "#")).toEqual(["#", "r0", "r1", "r2", "#", "r3", "r4"])
  })

  it("collapses a group as the reader asks, leaving its header", async () => {
    await GroupPart.warm()
    const onShut = vi.fn()
    const { rerender } = grid({}, [], onShut)
    fireEvent.click(screen.getByRole("button", { name: "Collapse Stage: Won, 3 rows" }))
    expect(onShut).toHaveBeenCalledWith([["Won"]])
    rerender(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} summary={{}} grouping={{ levels, counts: held, shut: [["Won"]], onShut }} />)
    expect(bodyRows()).toEqual(["r3", "r4"])
    expect(screen.getByRole("button", { name: "Expand Stage: Won, 3 rows" }).getAttribute("aria-expanded")).toBe("false")
  })

  it("read in windows, takes its groups and their totals from the server, and draws the rows not read yet as on their way", async () => {
    await GroupPart.warm()
    const served = [
      { key: ["Won"], count: 400, summaries: { "field:cost": { sum: 123456 } } },
      { key: ["Lost"], count: 800, summaries: { "field:cost": { sum: 7 } } },
    ]
    grid({ rows: rows.slice(0, 3), count: 1200, grouping: { levels, counts: served, shut: [], read: [], onShut: vi.fn() } })
    expect(headers()[0].textContent).toContain("400")
    expect(headers()[0].querySelector('[data-field="cost"]')?.textContent).toContain("123,456")
    expect(bodyRows()).toEqual(["r0", "r1", "r2"])
    expect(document.querySelectorAll("tbody tr[data-placeholder]").length).toBeGreaterThan(0)
  })
})

// Tables V3: a coloured row wears its hue as a stripe at its edge.
describe("a grid whose view colours its rows", () => {
  it("draws each coloured row's hue at its edge, and none on the rest", async () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} hues={new Map([["r0", "moss"], ["r3", "berry"]])} />)
    const stripes = [...document.querySelectorAll("tbody tr[data-row]")].map((r) => r.querySelector("[data-row-hue]")?.getAttribute("data-row-hue") ?? null)
    expect(stripes).toEqual(["moss", null, null, "berry", null])
  })
})
