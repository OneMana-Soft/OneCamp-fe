import { afterEach, describe, expect, it, vi } from "vitest"
import type { TableField, TableRow } from "@/services/tableService"
import type { ViewRules } from "@/lib/tables/viewRules"

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
const readEveryRow = vi.fn()
vi.mock("@/services/tableService", async (orig) => ({ ...(await orig<typeof import("@/services/tableService")>()), readEveryRow: (...a: unknown[]) => readEveryRow(...a) }))

import { OWN_ERRORS } from "@/lib/axiosInstance"
import { rulesToSpec } from "@/lib/tables/query"
import { stepFields, stepKindsText, transformRows, viewNamed } from "@/lib/tables/transform"
import type { ViewRows } from "@/lib/tables/viewRows"

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({ id, table_id: "t", name: id, type, config: JSON.stringify(config), position: 0 })
const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })

const name = field("name", "text")
const stage = field("stage", "select", { options: [{ id: "o1", label: "Won" }, { id: "o2", label: "Lost" }] })
const fields = [name, stage]
const rows = [row("r1", { name: "Acme", stage: "Won" }), row("r2", { name: "Globex", stage: "Lost" }), row("r3", { name: "Initech", stage: "Won" })]
const won: ViewRules = { match: "all", sort: [{ field: "name", dir: "desc" }], filters: [{ field: "stage", op: "is", value: "Won" }] }
const indexed = { indexed: true, sorts_text: true }
const view = (over: Partial<ViewRows> = {}): ViewRows => ({ tableId: "t", fields, rows, complete: true, rules: won, me: null, answers: indexed, query: "", ...over })

afterEach(() => {
  post.mockReset()
  readEveryRow.mockReset()
})

describe("a step over a view's rows (G2b, POST /tables/{id}/rows/transform)", () => {
  it("posts the step in the reader's zone, saying its own refusals, and answers what the server did", async () => {
    const done = { walked: 3, rows: 1, cells: 1, deleted: 0, matches: [{ row: "r1", field: "name", at: 0 }], capped: false, change_sets: [], skipped: [], skipped_count: 0, kept_changed: 0 }
    post.mockResolvedValue({ data: { data: done } })
    const out = await transformRows("t", { step: "find", fields: ["name"], find: "acme", rows: ["r1"] })
    expect(out).toEqual(done)
    const [url, body, config] = post.mock.calls[0]
    expect(url).toMatch(/^\/tables\/t\/rows\/transform\?tz=/)
    expect(body).toEqual({ step: "find", fields: ["name"], find: "acme", rows: ["r1"] })
    expect(config).toMatchObject(OWN_ERRORS)
  })

  it("names a page that holds every row by the ids of the rows the view shows, in its order", async () => {
    expect(await viewNamed(view())).toEqual({ rows: ["r3", "r1"] })
    expect(readEveryRow).not.toHaveBeenCalled()
  })

  it("names a page still reading by the view's rules, as the server's spec, when nothing is searched", async () => {
    expect(await viewNamed(view({ complete: false }))).toEqual({ spec: rulesToSpec(won, fields, indexed) })
    expect(readEveryRow).not.toHaveBeenCalled()
  })

  it("reads every row first when the view is searched, and names the ones it shows", async () => {
    readEveryRow.mockResolvedValue(rows)
    expect(await viewNamed(view({ complete: false, query: "init" }))).toEqual({ rows: ["r3"] })
    expect(readEveryRow).toHaveBeenCalledWith("t", expect.anything())
  })

  it("changes only the fields a person writes text in: never a choice, a number or a computed field", () => {
    const more = [name, stage, field("n", "number"), field("u", "url"), field("f", "formula", { formula: "1", result: "text" }), field("l", "long_text")]
    expect(stepFields(more).map((f) => f.id)).toEqual(["name", "u", "l"])
    // Those kinds in words, as the field menu names them (a name in capitals kept so).
    expect(stepKindsText()).toBe("text, long text, URL, email and phone")
  })
})
