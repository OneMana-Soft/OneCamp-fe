import { afterEach, describe, expect, it, vi } from "vitest"

// The row calls a table's page makes: a cell edit sends that cell alone
// (TAB-BUG-1), a new row lets the server put it last, and Export CSV reads
// every row, page by page, instead of the rows the page holds (TAB-BUG-2).

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get, post }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))
// A reader who writes 1.234,5, whatever the machine running the tests writes.
vi.mock("@/lib/format/number", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format/number")>()),
  numberSigns: () => ({ decimal: ",", group: "." }),
}))

const { createRow, patchRow, previewConversion, readEveryRow, relationWrite, updateField, writableValues } = await import("@/services/tableService")

afterEach(() => {
  get.mockReset()
  post.mockReset()
})

const row = (i: number) => ({ id: `r${i}`, table_id: "t", position: i, values: "{}", created_at: "", updated_at: "" })

describe("a cell edit", () => {
  it("posts the one cell to the patch route, with the reader's zone", async () => {
    post.mockResolvedValue({ data: { data: row(1) } })
    await patchRow("t", "r1", { status: "Won" })
    expect(post).toHaveBeenCalledWith("/tables/t/rows/r1/patch?tz=Asia%2FKolkata", { values: { status: "Won" } })
  })
})

describe("a new row", () => {
  it("names no place, so the server puts it after every row", async () => {
    post.mockResolvedValue({ data: { data: row(1200) } })
    await createRow("t", {})
    expect(post.mock.calls[0][1]).toEqual({ values: {} })
  })

  it("names its place when the caller gives one, for rows sent at once to a new table", async () => {
    post.mockResolvedValue({ data: { data: row(3) } })
    await createRow("t", {}, 3000)
    expect(post.mock.calls[0][1]).toEqual({ values: {}, position: 3000 })
  })
})

describe("reading every row, for an export", () => {
  it("pages until a page comes back short, each row once, saying how far it has got", async () => {
    // 2,350 rows; the second page repeats a row where it meets the first, as
    // a table changing between reads can.
    get.mockImplementation(async (url: string) => {
      const q = new URL(url, "http://x").searchParams
      const offset = Number(q.get("offset"))
      const limit = Number(q.get("limit"))
      const rows = Array.from({ length: Math.max(0, Math.min(limit, 2350 - offset)) }, (_, i) => row(offset + i))
      if (offset === 1000) rows[0] = row(999)
      return { data: { data: rows } }
    })
    const progress = vi.fn()
    const rows = await readEveryRow("t", { onProgress: progress })
    // Two pages at a time: the round that finds the end asks for one page past it.
    expect(get.mock.calls.map((c) => new URL(c[0], "http://x").searchParams.get("offset"))).toEqual(["0", "1000", "2000", "3000"])
    expect(get.mock.calls[0][1]).toMatchObject({ suppressErrorToast: true })
    expect(rows).toHaveLength(2349)
    expect(rows.at(-1)?.id).toBe("r2349")
    expect(progress).toHaveBeenLastCalledWith(2350)
  })
})

describe("a relation cell as a write sends it", () => {
  it("keeps every item's id and type, the hidden ones too, and drops names and the count of the rest", () => {
    expect(
      relationWrite([
        { id: "d1", type: "doc", label: "Launch plan" },
        { id: "d2", type: "doc", hidden: true },
        { id: "", type: "more", label: "3 more" },
      ]),
    ).toEqual([
      { id: "d1", type: "doc" },
      { id: "d2", type: "doc" },
    ])
  })

  it("is what a duplicated row's links are written as", () => {
    const fields = [{ id: "links", table_id: "t", name: "Links", type: "relation" as const, config: JSON.stringify({ relation_target: "doc" }), position: 0 }]
    expect(writableValues(fields, { links: [{ id: "d1", type: "doc", label: "Plan" }, { id: "d2", type: "doc", hidden: true }] })).toEqual({
      links: [
        { id: "d1", type: "doc" },
        { id: "d2", type: "doc" },
      ],
    })
  })
})

// Audit B3: a type change, and its count first, carry the reader's number
// signs, so the server reads "1,5" as 1.5 for a reader who writes it so.
describe("saving a field", () => {
  // The server keeps what a save leaves out. A stale tab's save sent the
  // page copy's name, config and position too, and put back a rename, a
  // setting or a move made meanwhile.
  it("sends only what it names: a rename its name, a setting its config, a move its place", async () => {
    post.mockResolvedValue({ data: {} })
    await updateField("t", "f", { name: "Cost" })
    await updateField("t", "f", { config: { format: { currency: "INR" } } })
    await updateField("t", "f", { position: 3 })
    await updateField("t", "f", { name: "Price", type: undefined, config: undefined })
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ name: "Cost" }, { config: { format: { currency: "INR" } } }, { position: 3 }, { name: "Price" }])
  })

  it("sends nothing for a save that names nothing", async () => {
    await updateField("t", "f", {})
    expect(post).not.toHaveBeenCalled()
  })

  it("sends neither a type nor number signs when it changes no type", async () => {
    post.mockResolvedValue({ data: {} })
    await updateField("t", "f", { config: { format: {} } })
    expect(post.mock.calls[0][1]).toEqual({ config: { format: {} } })
  })

  it("sends the reader's number signs with a type change and its count", async () => {
    post.mockResolvedValue({ data: { data: { kept: 0, converted: 0, cleared: 0 } } })
    await previewConversion("t", "f", "number")
    expect(post.mock.calls[0][1]).toEqual({ type: "number", decimal: ",", group: "." })
    await updateField("t", "f", { type: "number", config: {} })
    expect(post.mock.calls[1][1]).toEqual({ type: "number", config: {}, decimal: ",", group: "." })
  })
})
