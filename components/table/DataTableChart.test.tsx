import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  aggregateTable: () =>
    Promise.resolve({
      aggregate: "count",
      group_by: "Item",
      buckets: [
        { label: "Booth", value: 2, count: 2 },
        { label: "Ads", value: 1, count: 1 },
      ],
      matched_rows: 3,
      scanned_rows: 3,
      distinct_groups: 2,
    }),
}))

import { DataTableChart } from "./DataTableChart"

afterEach(cleanup)

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
    // The chart scrolls in the frame, as the grid does, with no second border.
    const body = document.querySelector("[data-table-chart]") as HTMLElement
    expect(body.className).toMatch(/overflow-auto/)
    await waitFor(() => expect(body.querySelector("figure")).toBeTruthy())
    expect(body.querySelector("figure")?.className).toMatch(/border-0/)
  })
})
