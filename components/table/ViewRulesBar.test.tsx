import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { ViewRulesBar, rowsShownText } from "@/components/table/ViewRulesBar"
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
      held={8}
      total={8}
    />
  )
}

afterEach(cleanup)

// A custom select: open it, pick an option.
function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }))
  fireEvent.click(screen.getByRole("option", { name: option }))
}

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
    choose("Sort by", "Cost")
    fireEvent.click(screen.getByRole("combobox", { name: "Order" }))
    expect(screen.getByRole("option", { name: "9 → 1" })).toBeTruthy()
    fireEvent.click(screen.getByRole("option", { name: "9 → 1" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [{ field: "cost", dir: "desc" }], filters: [], match: "all" })
    // The rule shows as a chip in the toolbar.
    expect(document.querySelector("[data-rule-chip]")?.textContent).toContain("Cost")
  })

  it("filters with the conditions a field takes, and a select's own options", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} />)
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    fireEvent.click(screen.getByRole("button", { name: "Add a filter" }))
    choose("Field", "Stage")
    choose("Value", "Live")
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [{ field: "stage", op: "contains", value: "Live" }], match: "all" })
    // A number field's conditions.
    choose("Field", "Cost")
    fireEvent.click(screen.getByRole("combobox", { name: "Condition" }))
    expect(screen.getByRole("option", { name: "≥" })).toBeTruthy()
    // "is empty" takes no value.
    fireEvent.click(screen.getByRole("option", { name: "is empty" }))
    expect(screen.queryByLabelText("Value")).toBeNull()
    // No browser selects anywhere in the editor.
    expect(document.querySelector("select")).toBeNull()
  })

  it("asks whether rows match all filters or any, once there are two", () => {
    const changed = vi.fn()
    render(
      <Holding
        onChange={changed}
        initial={{ sort: [], match: "all", filters: [{ field: "item", op: "contains", value: "a" }, { field: "cost", op: "gt", value: "5" }] }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    choose("Match", "any")
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ match: "any" }))
  })

  it("clears every rule at once", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} initial={{ sort: [{ field: "due", dir: "asc" }], filters: [], match: "all" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [], match: "all" })
  })
})

// A chip read "Item contains", a sentence that stops, while its value was
// still to come.
describe("a filter chip's words", () => {
  it("says a filter is waiting for its value", async () => {
    const { ruleText } = await import("./ViewRulesBar")
    const item = { id: "item", table_id: "t", name: "Item", type: "text" as const, config: "{}", position: 0 }
    expect(ruleText({ field: "item", op: "contains", value: "" }, item)).toBe("Item contains …")
    expect(ruleText({ field: "item", op: "contains", value: "booth" }, item)).toBe("Item contains booth")
  })
})

// TAB-BUG-2: past 500 rows the page holds only some of them. The toolbar
// says so whenever it does, and a filter or a search that it looked only in
// those; it read "12 rows" for 12 of the first 500.
describe("the rows shown, while the page holds only some", () => {
  const loading = (over: Partial<{ reading: boolean; failed: boolean }> = {}) => ({ reading: false, failed: false, onLoadAll: vi.fn(), onRetry: vi.fn(), ...over })

  it("says how many it holds of how many, and offers every row", () => {
    const l = loading()
    render(<ViewRulesBar fields={fields} rules={NO_RULES} onChange={vi.fn()} shown={2000} held={2000} total={12400} loading={l} />)
    expect(document.querySelector("[data-rows-shown]")?.textContent).toBe("Showing 2,000 of 12,400 rows · Load all")
    fireEvent.click(screen.getByRole("button", { name: "Load all" }))
    expect(l.onLoadAll).toHaveBeenCalled()
  })

  it("says a filter or a search looked only in the rows loaded", () => {
    expect(rowsShownText(12, 2000, 12400, false)).toBe("Showing 12 in the 2,000 of 12,400 rows loaded")
    expect(rowsShownText(12, 500, null, false)).toBe("Showing 12 in the 500 rows loaded")
  })

  it("says it's reading, and offers Try again when the rest couldn't be read", () => {
    const { rerender } = render(<ViewRulesBar fields={fields} rules={NO_RULES} onChange={vi.fn()} shown={500} held={500} total={1200} loading={loading({ reading: true })} />)
    expect(document.querySelector("[data-rows-shown]")?.textContent).toBe("Showing 500 of 1,200 rows · Loading…")
    const l = loading({ failed: true })
    rerender(<ViewRulesBar fields={fields} rules={NO_RULES} onChange={vi.fn()} shown={500} held={500} total={1200} loading={l} />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(l.onRetry).toHaveBeenCalled()
  })

  it("says nothing of the sort once every row is held", () => {
    expect(rowsShownText(8, 8, 8, true)).toBeNull()
    expect(rowsShownText(3, 1200, 1200, true)).toBe("Showing 3 of 1,200 rows")
  })
})
