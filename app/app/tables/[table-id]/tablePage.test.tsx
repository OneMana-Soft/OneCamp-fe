import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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

let fetched: { data?: { data: TableBundle }; isLoading: boolean } = { isLoading: false }
let saved: ViewRules = { sort: [], filters: [], match: "all" }
const saveViewRules = vi.fn()

vi.mock("next/navigation", () => ({
  useParams: () => ({ "table-id": TABLE_ID }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...fetched, mutate: vi.fn() }) }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => {} }))
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
vi.mock("@/components/table/DataTableBoard", () => ({ DataTableBoard: () => <div data-testid="board" /> }))
vi.mock("@/components/table/DataTableCalendar", () => ({ DataTableCalendar: () => <div data-testid="calendar" /> }))
vi.mock("@/components/table/DataTableChart", () => ({ DataTableChart: () => <div data-testid="chart" /> }))
vi.mock("@/components/marketplace/PublishTemplateDialog", () => ({ PublishTemplateDialog: () => null }))
vi.mock("@/components/guest/GuestLinkSection", () => ({ GuestLinkSection: () => null }))

import TableDetailPage from "./page"

beforeEach(() => window.history.replaceState(null, "", `/app/tables/${TABLE_ID}`))
afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  saved = { sort: [], filters: [], match: "all" }
  saveViewRules.mockReset()
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
    expect(screen.getByRole("heading", { name: "This table isn't available" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to tables" }).getAttribute("href")).toBe("/app/tables")
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
})
