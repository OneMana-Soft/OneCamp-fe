import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { getCoreRowModel, useReactTable, type ColumnDef, type ColumnFiltersState } from "@tanstack/react-table"
import { useState } from "react"
import { TaskTableFieldFilter, filterChoices } from "@/components/task/taskTableFieldFilter"
import type { TaskField } from "@/lib/tasks/fields"

afterEach(cleanup)

const base = { project_id: "p", options: [], on_card: false, position: 0 }
const channel: TaskField = { ...base, id: "c", name: "Channel", type: "select", filter_id: "field_c", options: [{ id: "aaaa1111", label: "Blog", color: "violet" }] }
const reviewer: TaskField = { ...base, id: "r", name: "Reviewer", type: "person", filter_id: "field_r" }
const notes: TaskField = { ...base, id: "n", name: "Notes", type: "text", filter_id: "field_n" }
const signed: TaskField = { ...base, id: "s", name: "Signed off", type: "checkbox", filter_id: "field_s" }

function Harness({ onFilters }: { onFilters: (f: ColumnFiltersState) => void }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const columns: ColumnDef<object>[] = [channel, reviewer, notes, signed].map((f) => ({ id: f.filter_id, accessorFn: () => undefined }))
  const table = useReactTable({
    data: [],
    columns,
    state: { columnFilters },
    onColumnFiltersChange: (u) =>
      setColumnFilters((prev) => {
        const next = typeof u === "function" ? u(prev) : u
        onFilters(next)
        return next
      }),
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
  })
  return <TaskTableFieldFilter table={table} fields={[channel, reviewer, notes, signed]} people={[{ id: "u1", name: "Maya Chen" }]} />
}

describe("the Fields filter", () => {
  it("offers each field's values, any value and none; a box is ticked or not", () => {
    expect(filterChoices(channel, []).map((c) => c.label)).toEqual(["Blog", "Any value", "No value"])
    expect(filterChoices(reviewer, [{ id: "u1", name: "Maya" }]).map((c) => c.value)).toEqual(["u1", "any", "none"])
    expect(filterChoices(signed, []).map((c) => c.value)).toEqual(["true", "none"])
  })

  it("narrows the list on the field's column, and leaves out fields it can't filter", () => {
    let filters: ColumnFiltersState = []
    render(<Harness onFilters={(f) => (filters = f)} />)
    fireEvent.click(screen.getByRole("button", { name: /Fields/ }))
    expect(screen.queryByText("Notes")).toBeNull()
    fireEvent.click(screen.getByText("Blog"))
    expect(filters).toEqual([{ id: "field_c", value: ["aaaa1111"] }])
    fireEvent.click(screen.getByText("Maya Chen"))
    expect(filters).toContainEqual({ id: "field_r", value: ["u1"] })
    fireEvent.click(screen.getByText("Clear field filters"))
    expect(filters).toEqual([])
  })
})
