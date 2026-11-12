import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { getCoreRowModel, useReactTable, type ColumnDef, type ColumnFiltersState } from "@tanstack/react-table"
import { useState } from "react"
import { TaskTableFieldFilter, filterChoices, warmFieldFilter } from "@/components/task/taskTableFieldFilter"
import type { TaskField } from "@/lib/tasks/fields"

afterEach(cleanup)
// The list is a chunk of its own, which the chip loads on pointer or focus;
// here it is in before the first click, as it is by a person's.
beforeAll(async () => {
  await warmFieldFilter()
})

const base = { project_id: "p", options: [], on_card: false, position: 0 }
const channel: TaskField = { ...base, id: "c", name: "Channel", type: "select", filter_id: "field_c", options: [{ id: "aaaa1111", label: "Blog", color: "violet" }] }
const reviewer: TaskField = { ...base, id: "r", name: "Reviewer", type: "person", filter_id: "field_r" }
const notes: TaskField = { ...base, id: "n", name: "Notes", type: "text", filter_id: "field_n" }
const signed: TaskField = { ...base, id: "s", name: "Signed off", type: "checkbox", filter_id: "field_s" }

function Harness({ onFilters, fields = [channel, reviewer, notes, signed] }: { onFilters: (f: ColumnFiltersState) => void; fields?: TaskField[] }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const columns: ColumnDef<object>[] = fields.map((f) => ({ id: f.filter_id, accessorFn: () => undefined }))
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
  return <TaskTableFieldFilter table={table} fields={fields} people={[{ id: "u1", name: "Maya Chen" }]} />
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

  // V-698W: a field the server hides from its reader (a money field, to anyone
  // not an admin of its project) narrows nothing for them on the server, so
  // it is never offered, whatever its type.
  it("never offers a field the server hides from its reader (V-698W)", () => {
    render(<Harness fields={[{ ...channel, hidden: true }, reviewer]} onFilters={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Fields/ }))
    expect(screen.queryByText("Channel")).toBeNull()
    expect(screen.queryByText("Blog")).toBeNull()
    expect(screen.getByText("Maya Chen")).toBeTruthy()
    cleanup()
    // With nothing else to filter on, there is no Fields filter at all.
    render(<Harness fields={[{ ...channel, hidden: true }]} onFilters={() => {}} />)
    expect(screen.queryByRole("button", { name: /Fields/ })).toBeNull()
  })
})
