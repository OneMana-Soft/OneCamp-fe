import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const answer = {
  aggregate: "count",
  group_by: "Item",
  buckets: [
    { label: "Booth", value: 2, count: 2 },
    { label: "Ads", value: 1, count: 1 },
  ],
  matched_rows: 3,
  scanned_rows: 3,
  distinct_groups: 2,
}
const aggregate = vi.hoisted(() => vi.fn())
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  aggregateTable: (...a: unknown[]) => aggregate(...a),
}))

import { DataTableChart } from "./DataTableChart"

beforeEach(() => aggregate.mockResolvedValue(answer))
afterEach(() => {
  cleanup()
  aggregate.mockReset()
  localStorage.clear()
})

describe("a table's chart controls", () => {
  it("are labelled in sentence case, quietly, like the rest of the app's forms", async () => {
    render(
      <DataTableChart
        tableId="t"
        fields={[{ id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }]}
        dataVersion="1"
      />,
    )
    await waitFor(() => expect(screen.getByText("Group by")).toBeTruthy())
    expect(screen.getByText("Group by").className).not.toMatch(/uppercase/)
    for (const name of ["Chart", "Group by", "Measure"]) expect(screen.getByRole("combobox", { name })).toBeTruthy()
  })

  it("sit in the toolbar row every view of the table has, at its height", async () => {
    render(
      <DataTableChart
        tableId="t"
        fields={[{ id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }]}
        dataVersion="1"
      />,
    )
    await waitFor(() => expect(screen.getByText("Group by")).toBeTruthy())
    const row = document.querySelector("[data-table-toolbar]") as HTMLElement
    expect(row).not.toBeNull()
    for (const name of ["Chart", "Group by", "Measure"]) {
      const trigger = screen.getByRole("combobox", { name })
      expect(row.contains(trigger)).toBe(true)
      expect(trigger.className).toMatch(/\bh-7\b/)
    }
    // The chart scrolls in the frame, as the grid does, on the sheet with no
    // border of its own (SvgChart draws none by default).
    const body = document.querySelector("[data-table-chart]") as HTMLElement
    expect(body.className).toMatch(/overflow-auto/)
    await waitFor(() => expect(body.querySelector("figure")).toBeTruthy())
    expect(body.querySelector("figure")?.className).not.toMatch(/\bborder\b/)
  })
})

// PTC-15 (QA 14 Oct): an answer with no buckets drew "Nothing to chart yet.
// Add rows to the table" over a table with rows.
describe("a table's chart that can't be drawn", () => {
  const fields = [{ id: "item", table_id: "t", name: "Item", type: "text" as const, config: "{}", position: 0 }]

  it("says it couldn't be loaded, with Try again, when the answer has no buckets", async () => {
    aggregate.mockResolvedValueOnce({})
    render(<DataTableChart tableId="t" fields={fields} dataVersion="1" />)
    expect(await screen.findByText("Couldn't load this chart")).toBeTruthy()
    // The shared read-failure state, as every screen's.
    expect(document.querySelector('[data-load-failure="failed"]')).not.toBeNull()
    expect(screen.queryByText(/Nothing to chart yet/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await waitFor(() => expect(document.querySelector("[data-table-chart] figure")).toBeTruthy())
  })

  it("says so when the request fails", async () => {
    aggregate.mockRejectedValueOnce(new Error("offline"))
    render(<DataTableChart tableId="t" fields={fields} dataVersion="1" />)
    expect(await screen.findByText("Couldn't load this chart")).toBeTruthy()
  })
})

// PTC-49 (QA 14 Oct): a chart grouped its rows by the first column, a bar a row.
describe("a table's chart at first", () => {
  it("groups by the first select, person or date column", async () => {
    const fields = [
      { id: "item", table_id: "t", name: "Item", type: "text" as const, config: "{}", position: 0 },
      { id: "cost", table_id: "t", name: "Cost", type: "number" as const, config: "{}", position: 1 },
      { id: "stage", table_id: "t", name: "Stage", type: "select" as const, config: "{}", position: 2 },
    ]
    render(<DataTableChart tableId="t2" fields={fields} dataVersion="1" />)
    await waitFor(() => expect(aggregate).toHaveBeenCalledWith("t2", expect.objectContaining({ group_by: "stage", aggregate: "count" })))
  })
})
