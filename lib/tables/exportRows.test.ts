import { afterEach, describe, expect, it, vi } from "vitest"
import type { TableField, TableRow } from "@/services/tableService"
import type { ViewRules } from "@/lib/tables/viewRules"

const readEveryRow = vi.fn()
vi.mock("@/services/tableService", async (orig) => ({ ...(await orig<typeof import("@/services/tableService")>()), readEveryRow: (...a: unknown[]) => readEveryRow(...a) }))
const downloadBlob = vi.fn()
const downloadFrom = vi.fn()
vi.mock("@/lib/utils/download", () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a), downloadFrom: (...a: unknown[]) => downloadFrom(...a) }))

import { exportRows, MAX_EXPORT_IDS, type ExportInput } from "./exportRows"
import { rulesToSpec } from "./query"

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({ id, table_id: "t", name: id[0].toUpperCase() + id.slice(1), type, config: JSON.stringify(config), position: 0 })
const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })

const name = field("name", "text")
const stage = field("stage", "select", { options: [{ id: "o1", label: "Won" }, { id: "o2", label: "Lost" }] })
const owner = field("owner", "people")
const fields = [name, stage, owner]
const rows = [row("r1", { name: "Acme", stage: "Won" }), row("r2", { name: "Globex", stage: "Lost" }), row("r3", { name: "Initech", stage: "Won" })]
const won: ViewRules = { match: "all", sort: [{ field: "name", dir: "desc" }], filters: [{ field: "stage", op: "is", value: "Won" }] }
const indexed = { indexed: true, sorts_text: true }

/** The export's toasts: what each said, in turn. */
function toasts() {
  const said: Record<string, unknown>[] = []
  const toast = vi.fn((t: Record<string, unknown>) => {
    said.push(t)
    return { id: "n", dismiss: vi.fn(), update: (u: Record<string, unknown>) => said.push(u) }
  })
  return { said, toast: toast as unknown as ExportInput["toast"] }
}

const input = (x: Partial<ExportInput>): ExportInput => ({
  format: "xlsx",
  tableId: "t",
  name: "Deals",
  shown: [name, stage],
  widths: { name: 240, owner: 90 },
  fields,
  rows,
  complete: true,
  total: 3,
  rules: won,
  me: null,
  answers: indexed,
  query: "",
  toast: toasts().toast,
  ...x,
})

afterEach(() => {
  readEveryRow.mockReset()
  downloadBlob.mockReset()
  downloadFrom.mockReset()
})

describe("a view's CSV", () => {
  it("is made here from the rows the page holds whole, as the view shows them, with no toast", async () => {
    const t = toasts()
    await exportRows(input({ format: "csv", toast: t.toast }))
    expect(downloadBlob).toHaveBeenCalledWith("Name,Stage\r\nInitech,Won\r\nAcme,Won", "text/csv;charset=utf-8", "Deals.csv")
    expect(downloadFrom).not.toHaveBeenCalled()
    expect(t.said).toEqual([])
  })

  it("keeps the rows that name whoever exports, when the view filters by me", async () => {
    const theirs = [row("r1", { name: "Acme", owner: [{ id: "U1", name: "Sam" }] }), row("r2", { name: "Globex", owner: [{ id: "u2", name: "Priya" }] })]
    const mine: ViewRules = { match: "all", sort: [], filters: [{ field: "owner", op: "contains", value: "@me" }] }
    await exportRows(input({ format: "csv", rows: theirs, rules: mine, me: "u1" }))
    expect((downloadBlob.mock.calls[0][0] as string).split("\r\n").map((l) => l.split(",")[0])).toEqual(["Name", "Acme"])
  })

  it("reads every row first when the page holds some, counting them, then says how many it wrote", async () => {
    const t = toasts()
    readEveryRow.mockImplementation(async (_: string, o: { onProgress: (n: number) => void }) => {
      o.onProgress(3)
      return rows
    })
    await exportRows(input({ format: "csv", complete: false, rows: [], toast: t.toast }))
    expect(t.said.map((s) => s.description ?? s.title)).toEqual(["Reading rows: 0 of 3", "Reading rows: 3 of 3", "Exported 2 rows"])
  })
})

describe("a view's Excel workbook", () => {
  it("is the server's, by the view's spec, when the server takes its rules: the shown fields at the grid's widths, nothing read here", async () => {
    const t = toasts()
    await exportRows(input({ toast: t.toast }))
    expect(readEveryRow).not.toHaveBeenCalled()
    expect(downloadFrom).toHaveBeenCalledWith(expect.stringMatching(/^\/tables\/t\/export(\?|$)/), "Deals.xlsx", {
      fields: ["name", "stage"],
      widths: { name: 240 },
      spec: rulesToSpec(won, fields, indexed),
    })
    expect(t.said.map((s) => s.title)).toEqual(["Exporting to Excel", "Exported to Excel"])
  })

  it("names its rows by id, in the view's order, when the view is searched or its rules are the browser's alone", async () => {
    await exportRows(input({ query: "acme" }))
    expect(downloadFrom).toHaveBeenLastCalledWith(expect.any(String), "Deals.xlsx", { fields: ["name", "stage"], widths: { name: 240 }, rows: ["r1"] })
    await exportRows(input({ answers: { indexed: false, sorts_text: false } }))
    expect(downloadFrom).toHaveBeenLastCalledWith(expect.any(String), "Deals.xlsx", { fields: ["name", "stage"], widths: { name: 240 }, rows: ["r3", "r1"] })
    // A people filter stays in the browser (the server can't read whom a cell names).
    const byOwner: ViewRules = { ...won, filters: [{ field: "owner", op: "contains", value: "u1" }] }
    expect(rulesToSpec(byOwner, fields, indexed)).toBeNull()
    await exportRows(input({ rules: byOwner }))
    expect(downloadFrom).toHaveBeenLastCalledWith(expect.any(String), "Deals.xlsx", { fields: ["name", "stage"], widths: { name: 240 }, rows: [] })
  })

  it("asks nothing of a view that shows more rows than an export names, and says to export CSV", async () => {
    const t = toasts()
    const many = Array.from({ length: MAX_EXPORT_IDS + 1 }, (_, i) => row(`r${i}`, {}))
    await exportRows(input({ rows: many, rules: { match: "all", sort: [], filters: [] }, answers: null, toast: t.toast }))
    expect(downloadFrom).not.toHaveBeenCalled()
    expect(t.said.at(-1)).toMatchObject({ tone: "error", title: "Too many rows for Excel", description: expect.stringContaining("Export CSV instead") })
  })

  it("says when the table is gone or no longer the reader's to open, and when the server failed", async () => {
    const t = toasts()
    downloadFrom.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 404"), { response: { status: 404 } }))
    await exportRows(input({ toast: t.toast }))
    expect(t.said.at(-1)).toMatchObject({ tone: "error", title: "Couldn't export the table", description: "It's gone, or you can no longer open it." })
    downloadFrom.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 503"), { response: { status: 503 } }))
    await exportRows(input({ toast: t.toast }))
    expect(t.said.at(-1)).toMatchObject({ tone: "error", description: "Not every row could be read. Try again." })
  })

  it("says the server's own words when it won't work out the view's formula over every row", async () => {
    const t = toasts()
    const total = field("total", "formula", { formula: "{Budget} * 2", result: "number" })
    const byTotal: ViewRules = { match: "all", sort: [{ field: "total", dir: "desc" }], filters: [] }
    const why = "This table has too many rows to work out a formula or a rollup over all of them yet."
    downloadFrom.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { msg: why } } }))
    await exportRows(input({ toast: t.toast, fields: [...fields, total], rules: byTotal }))
    expect(readEveryRow).not.toHaveBeenCalled()
    expect(downloadFrom).toHaveBeenLastCalledWith(expect.anything(), "Deals.xlsx", expect.objectContaining({ spec: { sorts: [{ field: "field:total", desc: true }] } }))
    expect(t.said.at(-1)).toMatchObject({ tone: "error", title: "Couldn't export the table", description: why })
  })

  // The workbook is asked for as a file, so the refusal comes as one: the
  // export reads its words back itself (withItsWords), and the shared
  // download helper stays as every other page ships it.
  it("reads the server's words back from the file a refusal came as", async () => {
    const t = toasts()
    const total = field("total", "formula", { formula: "{Budget} * 2", result: "number" })
    const byTotal: ViewRules = { match: "all", sort: [{ field: "total", dir: "desc" }], filters: [] }
    const why = "This table has too many rows to work out a formula or a rollup over all of them yet."
    const file = { type: "application/json", text: async () => JSON.stringify({ msg: why }) }
    downloadFrom.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: file } }))
    await exportRows(input({ toast: t.toast, fields: [...fields, total], rules: byTotal }))
    expect(t.said.at(-1)).toMatchObject({ tone: "error", title: "Couldn't export the table", description: why })
  })
})
