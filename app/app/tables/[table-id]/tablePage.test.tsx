import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
const saveViewRules = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => ({ "table-id": TABLE_ID }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  // The page names its tab by its address (lib/utils/pageName).
  usePathname: () => window.location.pathname,
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...fetched, mutate: vi.fn(async () => fetched.data) }) }))
// The page's calls to the server, by what it asks.
const { createRow, readEveryRow, updateTable, listRows } = vi.hoisted(() => ({ createRow: vi.fn(), readEveryRow: vi.fn(), updateTable: vi.fn(), listRows: vi.fn() }))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  createRow,
  readEveryRow,
  updateTable,
  listRows,
}))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => {} }))
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
    // A filter here hides every row.
    applyViewRules: (rows: TableRow[], _f: unknown, rules: ViewRules) => (rules.filters.length ? [] : rows),
  }
})
// The views themselves have their own tests; here they say what they were given.
vi.mock("@/components/table/DataTableGrid", () => ({
  DataTableGrid: ({ rows, empty }: { rows: TableRow[]; empty?: ReactNode }) => (
    <div data-testid="grid">{rows.length ? `${rows.length} rows` : empty}</div>
  ),
}))
vi.mock("@/components/table/DataTableBoard", () => ({ DataTableBoard: () => <div data-testid="board" />, BoardGroupBy: () => null }))
vi.mock("@/components/table/DataTableCalendar", () => ({
  DataTableCalendar: () => <div data-testid="calendar" />,
  CalendarMonthNav: () => <div data-testid="month-nav" />,
  monthOf: (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1),
}))
vi.mock("@/components/table/DataTableChart", () => ({ DataTableChart: () => <div data-testid="chart" /> }))
vi.mock("@/components/marketplace/PublishTemplateDialog", () => ({ PublishTemplateDialog: () => null }))
vi.mock("@/components/guest/GuestLinkSection", () => ({ GuestLinkSection: () => null }))

import TableDetailPage from "./page"
import { Toaster } from "@/components/ui/toaster"

beforeEach(() => {
  window.history.replaceState(null, "", `/app/tables/${TABLE_ID}`)
  listRows.mockImplementation(async () => [])
})
afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  saved = { sort: [], filters: [], match: "all" }
  saveViewRules.mockReset()
  createRow.mockReset()
  readEveryRow.mockReset()
  updateTable.mockReset()
  listRows.mockReset()
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
