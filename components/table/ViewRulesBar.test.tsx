import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { ViewRulesBar } from "@/components/table/ViewRulesBar"
import { NO_RULES, type ViewRules } from "@/lib/tables/viewRules"
import type { TableField } from "@/services/tableService"

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ label: "Draft" }, { label: "Live" }] }), position: 2 },
  { id: "due", table_id: "t", name: "Due", type: "date", config: "{}", position: 3 },
]

// The bar as the table page holds it: the rules in state.
function Holding({ initial = NO_RULES, onChange }: { initial?: ViewRules; onChange?: (r: ViewRules) => void }) {
  const [rules, setRules] = React.useState(initial)
  return (
    <ViewRulesBar
      fields={fields}
      rules={rules}
      onChange={(r) => {
        setRules(r)
        onChange?.(r)
      }}
      shown={3}
      total={8}
      truncated={false}
    />
  )
}

afterEach(cleanup)

describe("sorting and filtering a table", () => {
  it("says how many rows the rules show", () => {
    render(<Holding />)
    expect(screen.getByText("Showing 3 of 8 rows")).toBeTruthy()
  })

  it("sorts by a field, in words that fit it", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} />)
    fireEvent.click(screen.getByRole("button", { name: "Sort" }))
    fireEvent.click(screen.getByRole("button", { name: "Add a sort" }))
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "cost" } })
    expect(screen.getByRole("option", { name: "9 → 1" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Order"), { target: { value: "desc" } })
    expect(changed).toHaveBeenLastCalledWith({ sort: [{ field: "cost", dir: "desc" }], filters: [], match: "all" })
    expect(screen.getByRole("button", { name: "Sorted by Cost" })).toBeTruthy()
  })

  it("filters with the conditions a field takes, and a select's own options", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} />)
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    fireEvent.click(screen.getByRole("button", { name: "Add a filter" }))
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "stage" } })
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Live" } })
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [{ field: "stage", op: "contains", value: "Live" }], match: "all" })
    // A number field's conditions.
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "cost" } })
    expect(screen.getByRole("option", { name: "≥" })).toBeTruthy()
    // "is empty" takes no value.
    fireEvent.change(screen.getByLabelText("Condition"), { target: { value: "empty" } })
    expect(screen.queryByLabelText("Value")).toBeNull()
  })

  it("asks whether rows match all filters or any, once there are two", () => {
    const changed = vi.fn()
    render(
      <Holding
        onChange={changed}
        initial={{ sort: [], match: "all", filters: [{ field: "item", op: "contains", value: "a" }, { field: "cost", op: "gt", value: "5" }] }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "2 filters" }))
    fireEvent.change(screen.getByLabelText("Match"), { target: { value: "any" } })
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ match: "any" }))
  })

  it("clears every rule at once", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} initial={{ sort: [{ field: "due", dir: "asc" }], filters: [], match: "all" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [], match: "all" })
  })
})
