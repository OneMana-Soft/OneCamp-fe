import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { getCoreRowModel, useReactTable, type SortingState } from "@tanstack/react-table"

import { DisplayMenuBody } from "@/components/task/displayMenu"

// The SLA sort runs one way (the server reads no direction for it, H3): Display offers no Ascending or Descending for it
// and names it as the phone does (linear-24 W1 FIX C, V-1051).
vi.mock("@/hooks/useTaskViews", () => ({ useTaskViews: () => ({ views: [], save: vi.fn(), busy: false }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [] }) }))
vi.mock("@/hooks/useSlaView", () => ({ useSlaView: () => ({ shows: true, refused: false }) }))

afterEach(cleanup)

function Display({ sorting }: { sorting: SortingState }) {
  const table = useReactTable({ data: [], columns: [], state: { sorting }, onSortingChange: () => {}, getCoreRowModel: getCoreRowModel() })
  return (
    <DisplayMenuBody projectId="p" table={table} grouping="status" onGrouping={() => {}} props={[]} allProps={[]} onProps={() => {}} showCompleted="all" onShowCompleted={() => {}} layout="list" onReset={() => {}} />
  )
}

describe("Display's ordering by SLA", () => {
  it("offers no direction for it, and names it 'SLA, breaches soonest'", () => {
    render(<Display sorting={[{ id: "task_sla", desc: true }]} />)
    expect(screen.queryByRole("button", { name: "Descending" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Ascending" })).toBeNull()
    expect(screen.getAllByText("SLA, breaches soonest").length).toBeGreaterThan(0)
  })

  it("still offers a direction for every other ordering", () => {
    render(<Display sorting={[{ id: "task_due_date", desc: true }]} />)
    expect(screen.getByRole("button", { name: "Descending" })).toBeTruthy()
  })
})
