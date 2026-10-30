import { afterEach, beforeEach, describe, expect, it, vi, beforeAll } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { hueFor } from "@/lib/campHue"
import type { TableBundle, TableRow } from "@/services/tableService"
import type { ViewRules } from "@/lib/tables/viewRules"

const TABLE_ID = "8d78abe2-ad66-493c-9fe0-85a27b66a8bc"
const row = (id: string): TableRow => ({ id, table_id: TABLE_ID, position: 0, created_at: "", updated_at: "", values: "{}" })
const bundleWith = (rows: TableRow[]): TableBundle => ({
  table: { id: TABLE_ID, name: "Launch budget", visibility: "workspace", created_by: "", created_at: "", updated_at: "" },
  fields: [{ id: "item", table_id: TABLE_ID, name: "Item", type: "text", config: "{}", position: 0 }],
  views: [],
  rows,
  can_manage: true,
  mqtt_topic: "",
})

let fetched: { data?: { data: TableBundle }; isLoading: boolean; isError?: unknown } = { isLoading: false }
let saved: ViewRules = { sort: [], filters: [], match: "all" }
// Who the page said "me" was, the last time it applied a view's filters.
let ruledFor: string | null | undefined
const saveViewRules = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => ({ "table-id": TABLE_ID }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  // The page names its tab by its address (lib/utils/pageName).
  usePathname: () => window.location.pathname,
}))
// Who is signed in, as the page's profile says: a test may hold it on its way. Read again, it says Sam.
const SIGNED_IN = { data: { data: { user_uuid: "u-sam" } }, isLoading: false }
let profile: { data?: typeof SIGNED_IN.data; isLoading: boolean } = SIGNED_IN
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ ...fetched, mutate: vi.fn(async () => fetched.data) }),
  useFetchOnlyOnce: () => ({ ...profile, mutate: vi.fn(async () => SIGNED_IN.data) }),
}))
// The page's calls to the server, by what it asks.
const { createRow, readEveryRow, updateTable, listRows, queryRows, rowsByIds } = vi.hoisted(() => ({
  createRow: vi.fn(),
  readEveryRow: vi.fn(),
  updateTable: vi.fn(),
  listRows: vi.fn(),
  queryRows: vi.fn(),
  rowsByIds: vi.fn(),
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  createRow,
  readEveryRow,
  updateTable,
  listRows,
  queryRows,
  rowsByIds,
}))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => {} }))
// The row ledger's calls (tables A2): an undo, a redo.
const { undoChange, redoChange } = vi.hoisted(() => ({ undoChange: vi.fn(), redoChange: vi.fn() }))
vi.mock("@/lib/tables/ledger", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/tables/ledger")>()), undoChange, redoChange }))
const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
// The save dot has its own tests; it needs the app's tooltip providers.
vi.mock("@/components/docEditor/SaveDot", () => ({ SaveDot: ({ state }: { state: string }) => <span data-save-dot={state} /> }))
vi.mock("@/lib/tables/viewRules", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/tables/viewRules")>()
  return {
    ...real,
    loadViewRules: () => saved,
    saveViewRules: (...a: unknown[]) => saveViewRules(...a),
  }
})
// A filter here hides every row.
vi.mock("@/lib/tables/applyRules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tables/applyRules")>()),
  applyViewRules: (rows: TableRow[], _f: unknown, rules: ViewRules, me?: string | null) => {
    if (rules.filters.length) ruledFor = me
    return rules.filters.length ? [] : rows
  },
}))
// The views themselves have their own tests; here they say what they were given.
vi.mock("@/components/table/DataTableGrid", () => ({
  SelectionPart: { prefetch: () => Promise.resolve() },
  DataTableGrid: ({ rows, count, tail, empty, onNearEnd }: { rows: TableRow[]; count?: number; tail?: number; empty?: ReactNode; onNearEnd?: () => void }) => (
    <div data-testid="grid" data-count={count} data-tail={tail} data-first={rows[0]?.id} data-last={rows.at(-1)?.id}>
      {(count ?? rows.length) ? `${rows.length} rows` : empty}
      {/* Scrolling near the rows' end, as a press: no words, so the grid's text stays its rows'. */}
      {onNearEnd ? <button type="button" aria-label="Read the next window" onClick={onNearEnd} /> : null}
    </div>
  ),
}))
vi.mock("@/components/table/DataTableBoard", () => ({ DataTableBoard: () => <div data-testid="board" />, BoardGroupBy: () => null }))
vi.mock("@/components/table/DataTableCalendar", () => ({
  DataTableCalendar: () => <div data-testid="calendar" />,
  CalendarMonthNav: () => <div data-testid="month-nav" />,
  monthOf: (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1),
}))
vi.mock("@/components/table/DataTableChart", () => ({ DataTableChart: () => <div data-testid="chart" /> }))
vi.mock("@/components/table/layouts/TableTimeline", () => ({
  TableTimeline: ({ rows, count, gantt }: { rows: TableRow[]; count?: number; gantt?: boolean }) => (
    <div data-testid={gantt ? "gantt" : "timeline"} data-count={count} data-first={rows[0]?.id} />
  ),
}))
vi.mock("@/components/table/layouts/TableGallery", () => ({
  TableGallery: ({ rows, count, tail }: { rows: TableRow[]; count?: number; tail?: number }) => (
    <div data-testid="gallery" data-count={count} data-tail={tail} data-first={rows[0]?.id} />
  ),
}))
// What a template is made of, as the page hands it to the publish dialog.
const published = vi.hoisted(() => ({ payload: undefined as { views: { name: string }[] } | undefined }))
vi.mock("@/components/marketplace/PublishTemplateDialog", () => ({
  PublishTemplateDialog: ({ payload }: { payload: { views: { name: string }[] } }) => {
    published.payload = payload
    return null
  },
}))
vi.mock("@/components/guest/GuestLinkSection", () => ({ GuestLinkSection: () => null }))

import TableDetailPage from "./page"
import { Toaster } from "@/components/ui/toaster"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"
import { loadTablePageParts } from "@/components/table/lazyParts"

// The column menus, the cell pickers and the page's views, record and dialogs are chunks of their own
// (lazyView): loaded once, before these tests, they draw at once.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm(), loadTablePageParts()]))

beforeEach(() => {
  window.history.replaceState(null, "", `/app/tables/${TABLE_ID}`)
  listRows.mockImplementation(async () => [])
})
afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  profile = SIGNED_IN
  saved = { sort: [], filters: [], match: "all" }
  saveViewRules.mockReset()
  createRow.mockReset()
  readEveryRow.mockReset()
  updateTable.mockReset()
  listRows.mockReset()
  queryRows.mockReset()
  rowsByIds.mockReset()
  confirm.mockReset()
})

function spot() {
  return document.querySelector("[data-empty-illustration] svg")?.getAttribute("class") || ""
}

describe("a table's page", () => {
  it("loads in the shape of the table, not behind a spinner", () => {
    fetched = { isLoading: true }
    render(<TableDetailPage />)
    expect(screen.getByRole("status", { name: "Loading table" })).toBeTruthy()
    expect(document.querySelector(".animate-spin")).toBeNull()
  })

  it("leads back to the tables when the table is not there", () => {
    fetched = { isLoading: false, data: undefined }
    render(<TableDetailPage />)
    expect(screen.getByRole("heading", { name: "This table doesn't exist or was deleted" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to tables" }).getAttribute("href")).toBe("/app/tables")
  })

  // A template is for the whole workspace: a view of someone's own isn't theirs to give.
  it("makes a template of the table's shared views, never the reader's own", async () => {
    const shared = { id: "v1", table_id: TABLE_ID, name: "Everything", type: "grid" as const, config: "{}", position: 0 }
    fetched = { isLoading: false, data: { data: { ...bundleWith([]), views: [shared, { ...shared, id: "v2", name: "My calls", owner_id: "me", position: 1 }] } } }
    render(<TableDetailPage />)
    const more = screen.getByRole("button", { name: "More" })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(more, { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Save as template" }))
    await waitFor(() => expect(published.payload).toBeTruthy())
    expect(published.payload?.views.map((v) => v.name)).toEqual(["Everything"])
  })

  it("says a table that isn't the reader's is theirs to ask for", () => {
    fetched = { isLoading: false, data: undefined, isError: { response: { status: 403 } } }
    render(<TableDetailPage />)
    expect(screen.getByRole("heading", { name: "You can't see this table" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to tables" })).toBeTruthy()
  })

  it("offers Try again when the table couldn't be loaded, not \"doesn't exist\"", () => {
    fetched = { isLoading: false, data: undefined, isError: Object.assign(new Error("Network Error"), { response: { status: 502 } }) }
    render(<TableDetailPage />)
    expect(screen.queryByRole("heading", { name: "This table doesn't exist or was deleted" })).toBeNull()
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })

  it("with no rows yet, draws a tray in the table's own hue", () => {
    fetched = { isLoading: false, data: { data: bundleWith([]) } }
    render(<TableDetailPage />)
    expect(screen.getByRole("heading", { name: "No rows yet" })).toBeTruthy()
    expect(spot()).toContain(`hue-${hueFor(TABLE_ID)}`)
  })

  it("reads a filter on me as the person signed in", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    saved = { sort: [], filters: [{ field: "item", op: "contains", value: "@me" }] as ViewRules["filters"], match: "all" }
    render(<TableDetailPage />)
    expect(ruledFor).toBe("u-sam")
  })

  // CR-55's SF1: with the profile on its way, a filter on me ruled as no one, and the view's rows came up empty.
  it("holds a filter on me until the profile says who is signed in", () => {
    profile = { isLoading: true }
    ruledFor = undefined
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    saved = { sort: [], filters: [{ field: "item", op: "contains", value: "@me" }] as ViewRules["filters"], match: "all" }
    const { rerender } = render(<TableDetailPage />)
    expect(document.querySelector("[data-table-frame]")?.getAttribute("aria-busy")).toBe("true")
    expect(ruledFor).toBeUndefined()
    profile = SIGNED_IN
    rerender(<TableDetailPage />)
    expect(document.querySelector("[data-table-frame]")?.getAttribute("aria-busy")).toBeNull()
    expect(ruledFor).toBe("u-sam")
  })

  it("exports a filter on me as the person signed in, with the profile still on its way", async () => {
    profile = { isLoading: true }
    ruledFor = undefined
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    saved = { sort: [], filters: [{ field: "item", op: "contains", value: "@me" }] as ViewRules["filters"], match: "all" }
    // jsdom has no object URLs: the download is caught here.
    URL.createObjectURL = () => "blob:x"
    URL.revokeObjectURL = () => {}
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    render(<TableDetailPage />)
    const more = screen.getByRole("button", { name: "More" })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(more, { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Export CSV" }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(ruledFor).toBe("u-sam")
    click.mockRestore()
  })

  it("when its filters hide every row, says so and offers to clear them, keeping the sort", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a"), row("b")]) } }
    saved = { sort: [{ field: "item", dir: "asc" }] as ViewRules["sort"], filters: [{ field: "item", op: "contains", value: "zzz" }] as ViewRules["filters"], match: "all" }
    render(<TableDetailPage />)
    expect(screen.getByRole("heading", { name: "No rows match these filters" })).toBeTruthy()
    expect(spot()).toContain("hue-lake")
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(screen.getByTestId("grid").textContent).toBe("2 rows")
    expect(saveViewRules).toHaveBeenLastCalledWith(TABLE_ID, { sort: saved.sort, filters: [], match: "all" })
  })

  it("opens the view the address names, and writes the one chosen back to it", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?view=board`)
    render(<TableDetailPage />)
    expect(screen.getByTestId("board")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Board" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Chart" }))
    expect(screen.getByTestId("chart")).toBeTruthy()
    expect(new URLSearchParams(window.location.search).get("view")).toBe("chart")
    fireEvent.click(screen.getByRole("button", { name: "Grid" }))
    expect(window.location.search).toBe("")
  })

  it("keeps the name's underline space when it is not focused, so focusing it moves nothing", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    render(<TableDetailPage />)
    const name = screen.getByRole("textbox", { name: "Table name" })
    expect(name.className).toMatch(/(^|\s)border-b(\s|$)/)
    expect(name.className).not.toMatch(/focus:border-b\b/)
  })

  it("loads in the shape of the view the address names", () => {
    fetched = { isLoading: true }
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?view=board`)
    render(<TableDetailPage />)
    expect(screen.getByRole("status", { name: "Loading table" }).getAttribute("data-table-skeleton")).toBe("board")
  })

  it("draws every view in one frame, under one toolbar row, and says the same thing when filters hide every row", () => {
    fetched = { isLoading: false, data: { data: { ...bundleWith([row("a")]), fields: [...bundleWith([]).fields, { id: "due", table_id: TABLE_ID, name: "Due", type: "date", config: "{}", position: 1 }] } } }
    saved = { sort: [], filters: [{ field: "item", op: "contains", value: "zzz" }] as ViewRules["filters"], match: "all" }
    render(<TableDetailPage />)
    const frame = document.querySelector("[data-table-frame]") as HTMLElement
    for (const view of ["Board", "Calendar"]) {
      fireEvent.click(screen.getByRole("button", { name: view }))
      // The toolbar row is the frame's first child on every view.
      expect(frame.firstElementChild?.hasAttribute("data-table-toolbar")).toBe(true)
      expect(screen.getByRole("heading", { name: "No rows match these filters" })).toBeTruthy()
    }
    // The calendar's month is in that row, not a second one.
    expect((frame.firstElementChild as HTMLElement).querySelector('[data-testid="month-nav"]')).toBeTruthy()
  })

  it("leaves the way back to the phone's app bar", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    render(<TableDetailPage />)
    expect(screen.getByRole("link", { name: "Back to tables" }).className).toMatch(/\bhidden\b.*\bsm:inline-flex\b/)
  })

  it("shows a save dot by the name, and slides one underline under the view", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    render(<TableDetailPage />)
    expect(document.querySelector("[data-save-dot]")?.getAttribute("data-save-dot")).toBe("saved")
    expect(document.querySelectorAll("[data-tab-indicator]")).toHaveLength(1)
    // No box around the views: they sit on the sheet.
    expect((document.querySelector("[data-table-frame]") as HTMLElement).className).not.toMatch(/\bborder\b/)
  })
})

// TAB-BUG-2: the bundle carries a table's first 500 rows. Past them, the page
// says how many it holds of how many, exports every row, and lets the server
// put a new row last (a place worked out here was after the 500th, out of reach).
describe("a table past 500 rows", () => {
  const big = (): TableBundle => ({ ...bundleWith(Array.from({ length: 500 }, (_, i) => row(`r${i}`))), rows_truncated: true, row_count: 1200 })

  it("says how many rows the page holds, of how many, and offers every row", () => {
    fetched = { isLoading: false, data: { data: big() } }
    render(<TableDetailPage />)
    expect(document.querySelector("[data-rows-shown]")?.textContent).toBe("Showing 500 of 1,200 rows · Load all")
  })

  it("exports every row of the table, not the page's 500", async () => {
    fetched = { isLoading: false, data: { data: big() } }
    readEveryRow.mockResolvedValue(Array.from({ length: 1200 }, (_, i) => ({ ...row(`r${i}`), values: JSON.stringify({ item: `Line ${i}` }) })))
    let blob: Blob | undefined
    // jsdom has no object URLs: the download is caught here.
    URL.createObjectURL = (b: Blob | MediaSource) => ((blob = b as Blob), "blob:x")
    URL.revokeObjectURL = () => {}
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    render(<TableDetailPage />)
    const more = screen.getByRole("button", { name: "More" })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(more, { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Export CSV" }))
    await waitFor(() => expect(blob).toBeTruthy())
    expect(readEveryRow).toHaveBeenCalledWith(TABLE_ID, expect.objectContaining({ onProgress: expect.any(Function) }))
    const lines = (await blob!.text()).split("\r\n")
    expect(lines).toHaveLength(1201)
    expect(lines.at(-1)).toBe("Line 1199")
    click.mockRestore()
  })

  // The W0 audit (39213924's row): with the rest still being read, a filter
  // with no hit among the rows held said "No rows match these filters".
  it("says it's searching the rest while a filter has no hit among the rows read", () => {
    fetched = { isLoading: false, data: { data: big() } }
    saved = { sort: [], filters: [{ field: "item", op: "is", value: "Booth" }], match: "all" }
    listRows.mockImplementation(() => new Promise(() => {}))
    render(<TableDetailPage />)
    expect(screen.getByText("Searching the rest of the table…")).toBeTruthy()
    expect(screen.queryByText("No rows match these filters")).toBeNull()
  })

  it("asks for a new row with no place of its own", async () => {
    fetched = { isLoading: false, data: { data: big() } }
    createRow.mockResolvedValue({ ...row("new"), position: 1200 })
    render(<TableDetailPage />)
    fireEvent.keyDown(document.body, { key: "r" })
    await waitFor(() => expect(createRow).toHaveBeenCalledWith(TABLE_ID, {}))
  })
})

// The rows a page holds on its own stop at 10,000: a new row or a linked one
// past them read every row of the table to reach it (the audit's repro: a
// board's new card on a 100,000-row table, about 99,500 rows in 199 requests).
// Today's QA (14 Oct) on the table's header.
describe("a table's header", () => {
  it("keeps one heading, the name, for a manager who can rename it (PTC-40)", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("r1")]) } }
    render(<TableDetailPage />)
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading.querySelector("input")?.getAttribute("aria-label")).toBe("Table name")
  })

  it("names the table once on a phone, in the hero (PTC-46)", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("r1")]) } }
    render(<TableDetailPage />)
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Launch budget")
    expect(crumb.className).toMatch(/max-sm:hidden/)
  })

  it("tells a reader who can't change columns that rows are theirs to edit (PTC-62)", () => {
    fetched = { isLoading: false, data: { data: { ...bundleWith([row("r1")]), can_manage: false } } }
    render(<TableDetailPage />)
    expect(screen.getByText("You can edit its rows. Its owner changes its columns.")).toBeTruthy()
    cleanup()
    fetched = { isLoading: false, data: { data: bundleWith([row("r1")]) } }
    render(<TableDetailPage />)
    expect(screen.queryByText(/Its owner changes its columns/)).toBeNull()
  })

  it("draws its view tabs with the 44 px touch rule (PTC-14)", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("r1")]) } }
    render(<TableDetailPage />)
    const tabs = Array.from(document.querySelectorAll("[data-view]"))
    expect(tabs.length).toBeGreaterThan(1)
    for (const tab of tabs) expect(tab.hasAttribute("data-touch-target")).toBe(true)
  })

  it("leaves an input method's Enter in the name to it", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("r1")]) } }
    render(<TableDetailPage />)
    const name = screen.getByRole("textbox", { name: "Table name" })
    name.focus()
    fireEvent.change(name, { target: { value: "予算" } })
    fireEvent.keyDown(name, { key: "Enter", keyCode: 229 })
    expect(document.activeElement).toBe(name)
    expect(updateTable).not.toHaveBeenCalled()
  })
})

describe("a table past 10,000 rows", () => {
  const huge = (): TableBundle => ({ ...bundleWith(Array.from({ length: 500 }, (_, i) => row(`r${i}`))), rows_truncated: true, row_count: 12000 })
  const pages = async (_t: string, offset: number, limit: number) => Array.from({ length: Math.max(0, Math.min(limit, 12000 - offset)) }, (_, i) => row(`r${offset + i}`))
  const toasts = () => within(screen.getByRole("region", { name: /notifications/i }))

  it("says a new row went past the rows loaded, reading none to reach it; Load all reads on", async () => {
    fetched = { isLoading: false, data: { data: huge() } }
    listRows.mockImplementation(pages)
    createRow.mockResolvedValue({ ...row("new"), position: 12000 })
    render(
      <>
        <TableDetailPage />
        <Toaster />
      </>,
    )
    fireEvent.keyDown(document.body, { key: "r" })
    expect(await toasts().findByText("Added as the last row, past the first 10,000 loaded")).toBeTruthy()
    expect(listRows).not.toHaveBeenCalled()
    fireEvent.click(toasts().getByRole("button", { name: "Load all" }))
    await waitFor(() => expect(listRows).toHaveBeenCalledWith(TABLE_ID, 11500, 500, expect.any(AbortSignal)))
  })

  it("reads a linked row's table no further than its first 10,000 rows, and says the row isn't among them", async () => {
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?row=gone`)
    fetched = { isLoading: false, data: { data: huge() } }
    listRows.mockImplementation(pages)
    render(
      <>
        <TableDetailPage />
        <Toaster />
      </>,
    )
    expect(await toasts().findByText("This row isn't among the first 10,000 loaded", undefined, { timeout: 10_000 })).toBeTruthy()
    expect(Math.max(...listRows.mock.calls.map((c) => c[1] as number))).toBe(9500)
  })
})

// Tables T5c: a table past the bundle's page whose rules the server answers
// is read in windows of its view, in its order: no "Load all", no rows read
// to find one, and a new row held at the view's end until the person moves on.
describe("a view the server answers in windows", () => {
  const ROWS = 100_000
  const served = (): TableBundle => ({
    ...bundleWith(Array.from({ length: 500 }, (_, i) => row(`r${i}`))),
    rows_truncated: true,
    row_count: ROWS,
    row_query: { indexed: true, sorts_text: true },
  })
  // The server: the table's rows newest first for a sort that says desc; a
  // filter the page asks for keeps 12 of them.
  const answering = () =>
    queryRows.mockImplementation(async (_t: string, body: { spec: { filter?: unknown; sorts?: { desc?: boolean }[] }; cursor?: string; n: number; count?: boolean }) => {
      const total = body.spec.filter ? 12 : ROWS
      if (body.count) return { rows: [], total }
      const at = Number(body.cursor || 0)
      const n = Math.max(0, Math.min(body.n, total - at))
      const rows = Array.from({ length: n }, (_, i) => row(`r${body.spec.sorts?.[0]?.desc ? ROWS - 1 - (at + i) : at + i}`))
      return { rows, next: at + n < total ? String(at + n) : undefined }
    })
  const grid = () => screen.getByTestId("grid")

  it("reads the view's first window in its order, counts it, and offers no Load all", async () => {
    fetched = { isLoading: false, data: { data: served() } }
    saved = { sort: [{ field: "item", dir: "desc" }], filters: [], match: "all" }
    answering()
    render(<TableDetailPage />)
    await waitFor(() => expect(grid().dataset.first).toBe("r99999"))
    expect(grid().dataset.count).toBe("100000")
    expect(queryRows).toHaveBeenCalledWith(TABLE_ID, { spec: { sorts: [{ field: "field:item", desc: true }] }, cursor: undefined, n: 500 }, expect.any(AbortSignal))
    expect(listRows).not.toHaveBeenCalled()
    // Every row of the table shows: nothing to say, and nothing to load all of.
    expect(document.querySelector("[data-rows-shown]")).toBeNull()
    expect(screen.queryByRole("button", { name: "Load all" })).toBeNull()
  })

  // airtable-03: a formula's or a rollup's rules go to the server, which may
  // refuse them (a 422, in its own words). The view says why, never "Couldn't
  // load the rows", offers no Load all, and offers to clear just those rules.
  it("says why in the server's words when it won't read the view, and clears the formula's rules it can't answer", async () => {
    const why = "This table has too many rows to work out a formula or a rollup over all of them yet"
    const calc = { id: "calc", table_id: TABLE_ID, name: "Calc", type: "formula" as const, config: JSON.stringify({ formula: "1", result: "number" }), position: 1 }
    fetched = { isLoading: false, data: { data: { ...served(), fields: [...served().fields, calc] } } }
    saved = { sort: [{ field: "calc", dir: "desc" }], filters: [{ field: "item", op: "contains", value: "Booth" }], match: "all" } as ViewRules
    queryRows.mockRejectedValue(Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { msg: why } } }))
    render(<TableDetailPage />)
    await waitFor(() => expect(within(grid()).getByRole("heading", { name: why })).toBeTruthy())
    // Said once (DB-40): with no row drawn, the body says it with its button,
    // and the toolbar doesn't say it again.
    expect(screen.getAllByText(why)).toHaveLength(1)
    expect(screen.queryAllByRole("status").some((s) => s.textContent?.includes(why))).toBe(false)
    expect(screen.queryByText(/Couldn.t load the rows/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Load all" })).toBeNull()
    fireEvent.click(within(grid()).getByRole("button", { name: "Clear formula and rollup rules" }))
    expect(saveViewRules).toHaveBeenLastCalledWith(TABLE_ID, { sort: [], filters: saved.filters, match: "all" })
  })

  // A later window refused (M6: a sweep holds the kept lock, and the reader's
  // own read is past 10,000 rows): the rows read stay drawn, so the toolbar
  // says why, once.
  it("says a later window's refusal in the toolbar, over the rows it drew", async () => {
    const why = "This table has too many rows to work out a formula or a rollup over all of them yet"
    const calc = { id: "calc", table_id: TABLE_ID, name: "Calc", type: "formula" as const, config: JSON.stringify({ formula: "1", result: "number" }), position: 1 }
    fetched = { isLoading: false, data: { data: { ...served(), fields: [...served().fields, calc] } } }
    saved = { sort: [{ field: "calc", dir: "desc" }], filters: [], match: "all" } as ViewRules
    answering()
    const answer = queryRows.getMockImplementation()!
    queryRows.mockImplementation(async (t: string, body: { cursor?: string; count?: boolean }, signal?: AbortSignal) =>
      body.cursor && !body.count ? Promise.reject(Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { msg: why } } })) : answer(t, body, signal),
    )
    render(<TableDetailPage />)
    await waitFor(() => expect(grid().textContent).toBe("500 rows"))
    fireEvent.click(within(grid()).getByRole("button", { name: "Read the next window" }))
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === why)).toBe(true))
    expect(grid().textContent).toBe("500 rows")
    expect(screen.getAllByText(why)).toHaveLength(1)
  })

  it("says how many rows a filter shows once the server has counted them", async () => {
    fetched = { isLoading: false, data: { data: served() } }
    saved = { sort: [], filters: [{ field: "item", op: "contains", value: "Booth" }], match: "all" }
    answering()
    render(<TableDetailPage />)
    await waitFor(() => expect(document.querySelector("[data-rows-shown]")?.textContent).toBe("Showing 12 of 100,000 rows"))
    expect(grid().dataset.count).toBe("12")
  })

  it("opens a row the windows haven't reached by reading it alone", async () => {
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?row=r77777`)
    fetched = { isLoading: false, data: { data: served() } }
    answering()
    rowsByIds.mockImplementation(async (_t: string, ids: string[]) => ids.map((id) => ({ ...row(id), values: JSON.stringify({ item: "Far down" }) })))
    render(<TableDetailPage />)
    const record = await screen.findByRole("dialog", { name: "Far down, a row of Launch budget" })
    expect(rowsByIds).toHaveBeenCalledWith(TABLE_ID, ["r77777"], expect.any(AbortSignal))
    // No place in the view, and no steps: the windows weren't read through to find it.
    expect(within(record).queryByText(/ of /)).toBeNull()
    expect(Math.max(...queryRows.mock.calls.map((c) => Number((c[1] as { cursor?: string }).cursor || 0)))).toBe(0)
  })

  it("holds a new row at the view's end, past the rows not read yet", async () => {
    fetched = { isLoading: false, data: { data: served() } }
    saved = { sort: [{ field: "item", dir: "desc" }], filters: [], match: "all" }
    answering()
    createRow.mockResolvedValue({ ...row("new"), position: ROWS })
    rowsByIds.mockImplementation(async (_t: string, ids: string[]) => ids.map((id) => row(id)))
    render(<TableDetailPage />)
    await waitFor(() => expect(grid().dataset.first).toBe("r99999"))
    fireEvent.keyDown(document.body, { key: "r" })
    await waitFor(() => expect(grid().dataset.tail).toBe("1"))
    expect(grid().dataset.last).toBe("new")
    expect(grid().dataset.count).toBe("100001")
  })

  // B4: the gallery and the list show the view's rows as the grid does, from its windows.
  it("reads the view's windows in its order for the gallery and the list, as for the grid", async () => {
    fetched = { isLoading: false, data: { data: served() } }
    saved = { sort: [{ field: "item", dir: "desc" }], filters: [], match: "all" }
    answering()
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?view=gallery`)
    render(<TableDetailPage />)
    const gallery = () => screen.getByTestId("gallery")
    await waitFor(() => expect(gallery().dataset.first).toBe("r99999"))
    expect(gallery().dataset.count).toBe("100000")
    expect(screen.getByRole("button", { name: "Gallery" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "List" }))
    expect(new URLSearchParams(window.location.search).get("view")).toBe("list")
    await waitFor(() => expect(document.querySelector("[data-table-list] li[aria-setsize]")?.getAttribute("aria-setsize")).toBe("100000"))
    expect(listRows).not.toHaveBeenCalled()
    expect(screen.queryByTestId("grid")).toBeNull()
    // The timeline and the Gantt read the same windows.
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }))
    await waitFor(() => expect(screen.getByTestId("timeline").dataset.count).toBe("100000"))
    fireEvent.click(screen.getByRole("button", { name: "Gantt" }))
    await waitFor(() => expect(screen.getByTestId("gantt").dataset.first).toBe("r99999"))
    expect(new URLSearchParams(window.location.search).get("view")).toBe("gantt")
    expect(listRows).not.toHaveBeenCalled()
  })
})

// TAB-BUG-12: the header was saved whole from this page's copy, so a rename
// from a copy older than someone's "Make private" put the table back on show.
describe("a table's own settings", () => {
  it("send only what changed: a new name, or who can see it", async () => {
    updateTable.mockResolvedValue({})
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    render(<TableDetailPage />)
    const name = screen.getByRole("textbox", { name: "Table name" })
    fireEvent.change(name, { target: { value: "Launch budget 2027" } })
    fireEvent.blur(name)
    await waitFor(() => expect(updateTable).toHaveBeenLastCalledWith(TABLE_ID, { name: "Launch budget 2027" }))
    const more = screen.getByRole("button", { name: "More" })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(more, { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: /Make private/ }))
    await waitFor(() => expect(updateTable).toHaveBeenLastCalledWith(TABLE_ID, { visibility: "private" }))
  })

  it("clears the description by sending it empty", async () => {
    updateTable.mockResolvedValue({})
    fetched = { isLoading: false, data: { data: { ...bundleWith([row("a")]), table: { ...bundleWith([]).table, description: "Q4 spend" } } } }
    render(<TableDetailPage />)
    const about = screen.getByRole("textbox", { name: "What this table is for" })
    fireEvent.change(about, { target: { value: "" } })
    fireEvent.blur(about)
    await waitFor(() => expect(updateTable).toHaveBeenLastCalledWith(TABLE_ID, { description: "" }))
  })
})

// TAB-BUG-6: a table AI made is private to its asker, and its rows may come
// from their private messages; showing it to the workspace asks first.
describe("a table AI made", () => {
  const made = (visibility: "private" | "workspace") => ({ ...bundleWith([row("a")]), table: { ...bundleWith([]).table, visibility } })

  it("says only its maker can see it, and asks before showing it to the workspace", async () => {
    updateTable.mockResolvedValue({})
    fetched = { isLoading: false, data: { data: made("private") } }
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?made=ai`)
    render(<TableDetailPage />)
    expect(screen.getByRole("note").textContent).toMatch(/Only you can see this table/)
    fireEvent.click(screen.getByRole("button", { name: "Show to the workspace" }))
    expect(updateTable).not.toHaveBeenCalled()
    const asked = confirm.mock.lastCall![0] as { description: string; onConfirm: () => Promise<void> }
    expect(asked.description).toMatch(/private messages and docs/)
    await asked.onConfirm()
    expect(updateTable).toHaveBeenCalledWith(TABLE_ID, { visibility: "workspace" })
    expect(window.location.search).toBe("")
  })

  it("asks the same from the More menu, where a table a person made goes on show at once", async () => {
    updateTable.mockResolvedValue({})
    fetched = { isLoading: false, data: { data: made("private") } }
    const showFromMenu = () => {
      const more = screen.getByRole("button", { name: "More" })
      fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
      fireEvent.keyDown(more, { key: "Enter" })
      fireEvent.click(screen.getByRole("menuitem", { name: /Show to the workspace/ }))
    }
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?made=ai`)
    render(<TableDetailPage />)
    showFromMenu()
    expect(updateTable).not.toHaveBeenCalled()
    await (confirm.mock.lastCall![0] as { onConfirm: () => Promise<void> }).onConfirm()
    expect(updateTable).toHaveBeenCalledWith(TABLE_ID, { visibility: "workspace" })
    cleanup()
    updateTable.mockClear()
    confirm.mockClear()
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}`)
    render(<TableDetailPage />)
    showFromMenu()
    await waitFor(() => expect(updateTable).toHaveBeenCalledWith(TABLE_ID, { visibility: "workspace" }))
    expect(confirm).not.toHaveBeenCalled()
  })

  it("says nothing once the table is the workspace's, or for a table a person made", () => {
    fetched = { isLoading: false, data: { data: made("workspace") } }
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}?made=ai`)
    render(<TableDetailPage />)
    expect(document.querySelector("[data-made-by-ai]")).toBeNull()
    cleanup()
    fetched = { isLoading: false, data: { data: made("private") } }
    window.history.replaceState(null, "", `/app/tables/${TABLE_ID}`)
    render(<TableDetailPage />)
    expect(document.querySelector("[data-made-by-ai]")).toBeNull()
  })
})

// Tables A2: ⌘Z undoes the reader's latest change to the table, ⌘⇧Z redoes
// it, when they aren't typing; the toast says what was left as it is.
describe("a table's undo and redo keys", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true })
  })
  afterEach(() => {
    undoChange.mockReset()
    redoChange.mockReset()
  })

  it("undo and redo the reader's latest change, and say what they left", async () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    undoChange.mockResolvedValue({ change_set: "u", reversed: "c", kind: "edit", changes: 1, skipped: 1 })
    redoChange.mockResolvedValue({ change_set: "r", reversed: "u", kind: "undo", changes: 1, skipped: 0 })
    render(
      <>
        <TableDetailPage />
        <Toaster />
      </>,
    )
    fireEvent.keyDown(document.body, { key: "z", metaKey: true })
    await waitFor(() => expect(undoChange).toHaveBeenCalledWith(TABLE_ID))
    expect(await screen.findByText("1 change was left as it is: it changed again since.")).toBeTruthy()
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true })
    await waitFor(() => expect(redoChange).toHaveBeenCalledWith(TABLE_ID))
    expect(await screen.findByText("Redone")).toBeTruthy()
  })

  it("leave a field's own undo to it", () => {
    fetched = { isLoading: false, data: { data: bundleWith([row("a")]) } }
    render(<TableDetailPage />)
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Table name" }), { key: "z", metaKey: true })
    expect(undoChange).not.toHaveBeenCalled()
  })
})
