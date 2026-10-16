import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TableRowList } from "@/components/table/TableRowList"
import type { TableField, TableRow } from "@/services/tableService"

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
]
const rowsOf = (n: number): TableRow[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item: `Line ${i}`, cost: i }) }))

afterEach(cleanup)

// The TAB-BUG-2 amendment: the phone's list drew every row the page held, and
// 10,000 rows took a phone 15 s to show the first.
describe("a table as a list on a phone", () => {
  it("draws a window of rows, not every row held, and says where each is in the whole", () => {
    render(<TableRowList fields={fields} rows={rowsOf(10000)} onOpen={() => {}} />)
    const items = screen.getAllByRole("listitem")
    expect(items.length).toBeGreaterThan(5)
    expect(items.length).toBeLessThan(40)
    expect(items[0].getAttribute("aria-setsize")).toBe("10000")
    expect(items[0].getAttribute("aria-posinset")).toBe("1")
    // The rows not drawn still take their room, so the scrollbar is the whole list's.
    const list = document.querySelector("ul.v3-grid-list") as HTMLElement
    expect(parseInt(list.style.paddingBottom, 10)).toBeGreaterThan(9000 * 60)
  })

  // QA PTC-46 (14 Oct): a row's values read "1,200 · 1 · 11 Oct", unnamed.
  it("names each value under a row's title", () => {
    render(<TableRowList fields={fields} rows={rowsOf(2)} onOpen={() => {}} />)
    const row = screen.getByRole("button", { name: /Line 1/ })
    expect(row.textContent).toMatch(/Cost\s*1$/)
  })

  it("opens a row's record", () => {
    const open = vi.fn()
    render(<TableRowList fields={fields} rows={rowsOf(3)} onOpen={open} />)
    fireEvent.click(screen.getByRole("button", { name: /Line 1/ }))
    expect(open).toHaveBeenCalledWith("r1")
  })

  it("asks for more rows near the end of those it was given", () => {
    const near = vi.fn()
    render(<TableRowList fields={fields} rows={rowsOf(20)} onOpen={() => {}} onNearEnd={near} />)
    expect(near).toHaveBeenCalled()
  })
})
