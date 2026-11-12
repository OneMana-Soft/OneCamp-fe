import { afterEach, describe, expect, it, vi } from "vitest"
import type { TableField, TableRow } from "@/services/tableService"
import { columnWidth } from "@/lib/tables/display"
import { printSheet, printView } from "./printView"

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({ id, table_id: "t", name: id[0].toUpperCase() + id.slice(1), type, config: JSON.stringify(config), position: 0 })
const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })

const name = field("name", "text")
const spend = field("spend", "number")
const stage = field("stage", "select", { options: [{ id: "o1", label: "Won" }, { id: "o2", label: "Lost" }] })
const fields = [name, spend, stage]
const rows = [row("r1", { name: "Acme", spend: 1200, stage: "Won" }), row("r2", { name: "Initech", spend: 30, stage: "Won" }), row("r3", { name: "Globex", spend: 800.5, stage: "Lost" })]

const host = () => document.querySelector<HTMLElement>("[data-table-print]")
const texts = (sel: string) => Array.from(host()?.querySelectorAll(sel) ?? []).map((n) => n.textContent)

afterEach(() => {
  document.querySelectorAll("[data-table-print], style[data-table-print-style]").forEach((n) => n.remove())
  vi.restoreAllMocks()
})

describe("a view as it prints", () => {
  it("has the shown fields in their order at the grid's widths as shares, numbers flagged, each cell as the CSV writes it", () => {
    const sheet = printSheet("Deals — Won", [spend, name], rows.slice(0, 2), { name: 300 }, fields)
    const w = columnWidth(spend)
    expect(sheet.columns).toEqual([
      { name: "Spend", numeric: true, share: Math.round((w / (w + 300)) * 10_000) / 100 },
      { name: "Name", numeric: false, share: Math.round((300 / (w + 300)) * 10_000) / 100 },
    ])
    expect(sheet.lines).toEqual([{ cells: ["1200", "Acme"] }, { cells: ["30", "Initech"] }])
    expect(sheet.rows).toBe(2)
    expect(sheet.landscape).toBe(false)
  })

  it("heads each of a grouped view's groups with its field, its name and its rows, where its rows start", () => {
    const won = rows.filter((r) => r.id !== "r3")
    const sheet = printSheet("Deals", [name], [...won, rows[2]], {}, fields, [{ field: "stage", dir: "asc" }])
    expect(sheet.lines).toEqual([
      { heading: "Stage: Won · 2 rows", depth: 0 },
      { cells: ["Acme"] },
      { cells: ["Initech"] },
      { heading: "Stage: Lost · 1 row", depth: 0 },
      { cells: ["Globex"] },
    ])
    expect(sheet.rows).toBe(3)
  })

  it("heads each level of a view grouped twice with its own field and name, where its rows start, the inner level deeper", () => {
    const region = field("region", "select", { options: [{ id: "n1", label: "North" }, { id: "s1", label: "South" }] })
    const placed = [row("r1", { name: "Acme", stage: "Won", region: "North" }), row("r2", { name: "Initech", stage: "Won", region: "South" }), row("r3", { name: "Globex", stage: "Lost", region: "North" })]
    const sheet = printSheet("Deals", [name], placed, {}, [...fields, region], [{ field: "stage", dir: "asc" }, { field: "region", dir: "asc" }])
    expect(sheet.lines).toEqual([
      { heading: "Stage: Won · 2 rows", depth: 0 },
      { heading: "Region: North · 1 row", depth: 1 },
      { cells: ["Acme"] },
      { heading: "Region: South · 1 row", depth: 1 },
      { cells: ["Initech"] },
      { heading: "Stage: Lost · 1 row", depth: 0 },
      { heading: "Region: North · 1 row", depth: 1 },
      { cells: ["Globex"] },
    ])
    vi.spyOn(window, "print").mockImplementation(() => {})
    printView(sheet)
    const heads = Array.from(host()!.querySelectorAll<HTMLElement>("tbody tr[data-group] th"))
    expect(heads.map((h) => [h.closest("tr")!.getAttribute("data-group"), h.style.paddingLeft])).toEqual([
      ["0", "1.5mm"],
      ["1", "5.5mm"],
      ["1", "5.5mm"],
      ["0", "1.5mm"],
      ["1", "5.5mm"],
    ])
  })

  it("prints landscape when the grid's columns are wider than a portrait page holds", () => {
    expect(printSheet("Wide", [name, spend, stage], [], { name: 600, spend: 300, stage: 300 }, fields).landscape).toBe(true)
  })
})

describe("printing a view", () => {
  it("prints the title, a header row that repeats, a row a line, numbers right-aligned, and takes it all away after", () => {
    let during: string[] = []
    let title = ""
    vi.spyOn(window, "print").mockImplementation(() => {
      during = texts("tbody td")
      title = document.title
    })
    printView(printSheet("Deals — Won", [name, spend], rows, { name: 240, spend: 120 }, fields))
    expect(during).toEqual(["Acme", "1200", "Initech", "30", "Globex", "800.5"])
    expect(title).toBe("Deals — Won")
    expect(texts("h1")).toEqual(["Deals — Won"])
    expect(texts("thead th")).toEqual(["Name", "Spend"])
    expect(Array.from(host()!.querySelectorAll("col")).map((c) => c.style.width)).toEqual(["66.67%", "33.33%"])
    expect(Array.from(host()!.querySelectorAll("tbody tr:first-child td")).map((c) => c.className)).toEqual(["", "n"])
    const css = document.querySelector("style[data-table-print-style]")!.textContent!
    expect(css).toMatch(/@media print\{.*\[data-table-print\] thead\{display:table-header-group\}/)
    expect(css).toContain("@media screen{[data-table-print]{display:none}}")
    window.dispatchEvent(new Event("afterprint"))
    expect(host()).toBeNull()
    expect(document.querySelector("style[data-table-print-style]")).toBeNull()
  })

  it("prints an empty view as a page that says it has no rows, under its header row", () => {
    vi.spyOn(window, "print").mockImplementation(() => {})
    printView(printSheet("Deals", [name, spend], [], {}, fields))
    expect(texts("thead th")).toEqual(["Name", "Spend"])
    expect(texts("tbody td")).toEqual(["No rows in this view."])
    expect(host()!.querySelector("tbody td")!.getAttribute("colspan")).toBe("2")
    expect(texts("p")).toEqual(["0 rows"])
  })

  it("says so when the view shows no fields, and draws no table", () => {
    vi.spyOn(window, "print").mockImplementation(() => {})
    printView(printSheet("Deals", [], rows, {}, fields))
    expect(texts("p")).toEqual(["This view shows no fields."])
    expect(host()!.querySelector("table")).toBeNull()
  })

  it("puts a cell's text in as text, never as markup", () => {
    vi.spyOn(window, "print").mockImplementation(() => {})
    printView(printSheet("<i>Deals</i>", [name], [row("x", { name: "<img src=x onerror=alert(1)>" })], {}, fields))
    expect(host()!.querySelector("img, i")).toBeNull()
    expect(texts("tbody td")).toEqual(["<img src=x onerror=alert(1)>"])
  })

  it("asks the print dialog for a landscape page for a wide view alone", () => {
    vi.spyOn(window, "print").mockImplementation(() => {})
    const style = () => document.querySelector("style[data-table-print-style]")!.textContent!
    printView(printSheet("Wide", [name, spend, stage], rows, { name: 600, spend: 300, stage: 300 }, fields))
    expect(style()).toContain("@page{size:landscape}")
    window.dispatchEvent(new Event("afterprint"))
    printView(printSheet("Narrow", [name, spend], rows, { name: 240, spend: 120 }, fields))
    expect(style()).not.toContain("landscape")
  })

  it("prints its group headings across the row", () => {
    vi.spyOn(window, "print").mockImplementation(() => {})
    printView(printSheet("Deals", [name, spend], rows, {}, fields, [{ field: "stage", dir: "asc" }]))
    const heads = host()!.querySelectorAll("tbody tr[data-group] th")
    expect(Array.from(heads).map((h) => [h.textContent, h.getAttribute("colspan")])).toEqual([
      ["Stage: Won · 2 rows", "2"],
      ["Stage: Lost · 1 row", "2"],
    ])
  })
})
