import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TableRowList } from "@/components/table/TableRowList"
import { scrollBox, sizeBoxes } from "@/lib/testing/virtualBox"
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
    render(<TableRowList fields={fields} edits={new Map()} rows={rowsOf(10000)} onOpen={() => {}} />)
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
    render(<TableRowList fields={fields} edits={new Map()} rows={rowsOf(2)} onOpen={() => {}} />)
    const row = screen.getByRole("button", { name: /Line 1/ })
    expect(row.textContent).toMatch(/Cost\s*1$/)
  })

  it("opens a row's record", () => {
    const open = vi.fn()
    render(<TableRowList fields={fields} edits={new Map()} rows={rowsOf(3)} onOpen={open} />)
    fireEvent.click(screen.getByRole("button", { name: /Line 1/ }))
    expect(open).toHaveBeenCalledWith("r1")
  })

  it("asks for more rows near the end of those it was given", () => {
    const near = vi.fn()
    render(<TableRowList fields={fields} edits={new Map()} rows={rowsOf(20)} onOpen={() => {}} onNearEnd={near} />)
    expect(near).toHaveBeenCalled()
  })
})

// Tables T5c: a view the server answers is read in windows as the list
// reaches them. The list holds the places of the rows not read yet, so its
// scrollbar is the view's, and keeps the rows added here at the view's end.
describe("a view read in windows, on a phone", () => {
  const box = () => document.querySelector<HTMLElement>("[data-list-scroll]")!
  let unsized: () => void = () => {}
  beforeEach(() => {
    unsized = sizeBoxes("data-list-scroll", { width: 390, height: 720 })
  })
  afterEach(() => unsized())

  it("holds the places of the rows not read yet, and asks for them as it nears them", () => {
    const near = vi.fn()
    render(<TableRowList fields={fields} edits={new Map()} rows={rowsOf(500)} count={2000} onOpen={() => {}} onNearEnd={near} />)
    const items = screen.getAllByRole("listitem")
    expect(items[0].getAttribute("aria-setsize")).toBe("2000")
    // The scrollbar is the view's: 2,000 rows of 60 px, drawn or held.
    const list = document.querySelector("ul.v3-grid-list") as HTMLElement
    const drawn = document.querySelectorAll("ul.v3-grid-list > li").length
    expect(parseInt(list.style.paddingTop || "0", 10) + drawn * 60 + parseInt(list.style.paddingBottom, 10)).toBe(2000 * 60)
    expect(near).not.toHaveBeenCalled()
    // Past the 500 read: rows on their way, drawn as placeholders, and the list asks as far as it shows.
    scrollBox(box(), 600 * 60)
    expect(document.querySelectorAll("li[data-placeholder]").length).toBeGreaterThan(5)
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
    expect(near).toHaveBeenCalled()
    expect(near.mock.lastCall?.[0]).toBeGreaterThanOrEqual(600 + 11)
  })

  it("keeps the rows added here at the view's end", () => {
    const added: TableRow = { ...rowsOf(1)[0], id: "new", values: JSON.stringify({ item: "Added here", cost: 7 }) }
    render(<TableRowList fields={fields} edits={new Map()} rows={[...rowsOf(500), added]} count={2001} tail={1} onOpen={() => {}} />)
    scrollBox(box(), 2001 * 60 - 720)
    const row = screen.getByRole("button", { name: /Added here/ }).closest("li")!
    expect(row.getAttribute("aria-posinset")).toBe("2001")
    expect(row.getAttribute("aria-setsize")).toBe("2001")
  })

  it("brings a row added here into sight at its place, the view's last", () => {
    const scrolled = vi.fn()
    const was = Element.prototype.scrollTo
    Element.prototype.scrollTo = scrolled as unknown as typeof Element.prototype.scrollTo
    try {
      const added: TableRow = { ...rowsOf(1)[0], id: "new", values: JSON.stringify({ item: "Added here" }) }
      render(<TableRowList fields={fields} edits={new Map()} rows={[...rowsOf(500), added]} count={2001} tail={1} onOpen={() => {}} scrollTo="new" />)
      const tops = scrolled.mock.calls.map((c) => (c[0] as ScrollToOptions).top ?? 0)
      // Its place is the 2,001st: the list scrolls to it, not to the 501st row given.
      expect(Math.max(...tops)).toBeGreaterThan(1980 * 60)
    } finally {
      Element.prototype.scrollTo = was
    }
  })
})

// REGRESSION-HUNT-1 (26 Oct): a row drew its copy, so an edit made in its
// record, closed before the save answered, showed the old value.
describe("a row whose edit is saving", () => {
  it("shows the edit over its copy, and is marked as saving", () => {
    const edits = new Map([["r1", { saving: { cost: 1207 }, saved: {}, copy: null }]])
    render(<TableRowList fields={fields} edits={edits} rows={rowsOf(2)} onOpen={() => {}} />)
    const row = screen.getByRole("button", { name: /Line 1/ })
    expect(row.textContent).toMatch(/Cost\s*1,207$/)
    expect(row.closest("li")!.getAttribute("aria-busy")).toBe("true")
    expect(screen.getByRole("button", { name: /Line 0/ }).closest("li")!.hasAttribute("aria-busy")).toBe(false)
  })
})

// Tables V2b: a grouped list heads each group, and a group the reader
// collapses keeps its header and hides its rows.
describe("a grouped list on a phone", () => {
  const staged: TableField[] = [...fields, { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ label: "Won" }, { label: "Lost" }] }), position: 2 }]
  const counts = [
    { key: ["Won"], count: 2, from: 0 },
    { key: ["Lost"], count: 3, from: 2 },
  ]
  const draw = (shut: string[][], onShut = vi.fn()) => (
    <TableRowList fields={staged} edits={new Map()} rows={rowsOf(5)} onOpen={() => {}} grouping={{ levels: [{ field: "stage", dir: "asc" }], counts, shut, onShut }} />
  )
  const items = () => screen.getAllByRole("listitem").map((li) => (li.hasAttribute("data-group-header") ? "#" : li.textContent?.match(/Line \d/)?.[0]))

  it("draws each group's value and count above its rows, and collapses one as the reader asks", () => {
    const onShut = vi.fn()
    const { rerender } = render(draw([], onShut))
    expect(items()).toEqual(["#", "Line 0", "Line 1", "#", "Line 2", "Line 3", "Line 4"])
    fireEvent.click(screen.getByRole("button", { name: "Collapse Stage: Won, 2 rows" }))
    expect(onShut).toHaveBeenCalledWith([["Won"]])
    rerender(draw([["Won"]], onShut))
    expect(items()).toEqual(["#", "#", "Line 2", "Line 3", "Line 4"])
    expect(screen.getByRole("button", { name: "Expand Stage: Won, 2 rows" }).getAttribute("aria-expanded")).toBe("false")
  })
})

// Tables V3: a coloured row wears its hue as a stripe at its edge.
describe("a list whose view colours its rows", () => {
  it("draws each coloured row's hue at its edge", () => {
    render(<TableRowList fields={fields} edits={new Map()} rows={rowsOf(3)} onOpen={() => {}} hues={new Map([["r1", "sun"]])} />)
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector("[data-row-hue]")?.getAttribute("data-row-hue") ?? null)).toEqual([null, "sun", null])
  })
})
