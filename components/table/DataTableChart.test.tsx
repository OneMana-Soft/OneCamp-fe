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
    for (const label of ["Group by", "Measure"]) {
      expect(screen.getByText(label).className).not.toMatch(/uppercase/)
    }
  })
})
