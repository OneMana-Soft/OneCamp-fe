import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import * as React from "react"
import { ViewRulesBar, loadRuleMenus, rowsShownPlaceholder, rowsShownText } from "@/components/table/ViewRulesBar"
import { NO_RULES, type ViewRules } from "@/lib/tables/viewRules"
import { pinTestClock } from "@/lib/testing/testClock"
import type { TableField } from "@/services/tableService"

// The menus' insides are a chunk of their own (ViewRulesBar), loaded first.
beforeAll(() => loadRuleMenus())

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ label: "Draft" }, { label: "Live" }] }), position: 2 },
  { id: "due", table_id: "t", name: "Due", type: "date", config: "{}", position: 3 },
  { id: "owners", table_id: "t", name: "Owners", type: "people", config: "{}", position: 4 },
]

// The bar as the table page holds it: the rules in state.
function Holding({ initial = NO_RULES, onChange, of = fields }: { initial?: ViewRules; onChange?: (r: ViewRules) => void; of?: TableField[] }) {
  const [rules, setRules] = React.useState(initial)
  return (
    <ViewRulesBar
      fields={of}
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
// A date filter's day is written here: every test runs on the tests' own today (app/testClock.test.ts).
pinTestClock()

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
    fireEvent.click(screen.getByRole("button", { name: "Sort and group" }))
    fireEvent.click(screen.getByRole("button", { name: "Add a sort" }))
    choose("Sort by", "Cost")
    fireEvent.click(screen.getByRole("combobox", { name: "Order" }))
    expect(screen.getByRole("option", { name: "9 → 1" })).toBeTruthy()
    fireEvent.click(screen.getByRole("option", { name: "9 → 1" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [{ field: "cost", dir: "desc" }], filters: [], match: "all" })
    // The rule shows as a chip in the toolbar.
    expect(document.querySelector("[data-rule-chip]")?.textContent).toContain("Cost")
    // A choice sorts by its options' order, as its groups do, and says so.
    choose("Sort by", "Stage")
    fireEvent.click(screen.getByRole("combobox", { name: "Order" }))
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["First → last", "Last → first"])
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

  it("names whoever reads the view as me", async () => {
    const { ruleText } = await import("./ViewRulesBar")
    expect(ruleText({ field: "owners", op: "contains", value: "@me" }, fields[4])).toBe("Owners has me")
    expect(ruleText({ field: "owners", op: "not_contains", value: "@me" }, fields[4])).toBe("Owners doesn't have me")
  })
})

// Tables V4: filters nest in groups, matched all or any within each, three
// deep (the view's own list the first) and fifty in all; and a people filter
// can name whoever reads the view, as the server's spec does (QuerySpec Me).
describe("groups of filters", () => {
  const item = (value: string) => ({ field: "item", op: "contains" as const, value })
  const groupsIn = () => screen.queryAllByRole("group", { name: /^A group of/ })
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Filter" }))

  it("adds a group holding a filter, which matches all or any of its own", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} />)
    open()
    fireEvent.click(screen.getByRole("button", { name: "Add a group" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [{ match: "all", filters: [item("")] }], match: "all" })
    expect(groupsIn().map((g) => g.getAttribute("aria-label"))).toEqual(["A group of 1 filter"])
    choose("Match in this group", "any")
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [{ match: "any", filters: [item("")] }], match: "all" })
    // A group of one says its filter, still waiting for its value (DESIGN-BUILD-20's SF1: it read "Any of 1 filter").
    expect(document.querySelector("[data-rule-chip]")?.textContent).toBe("Item contains …")
  })

  it("says a group of one, in a group of one, as its filter, and takes the whole away", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} initial={{ sort: [], match: "all", filters: [{ match: "any", filters: [{ match: "all", filters: [item("a")] }] }] }} />)
    expect(document.querySelector("[data-rule-chip]")?.textContent).toBe("Item contains a")
    fireEvent.click(screen.getByRole("button", { name: "Remove the filter Item contains a" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [], match: "all" })
  })

  it("offers no group in a group at the third level", () => {
    render(<Holding initial={{ sort: [], match: "all", filters: [{ match: "all", filters: [{ match: "any", filters: [item("a")] }] }] }} />)
    open()
    const [outer, inner] = groupsIn()
    expect(within(inner).getByRole("button", { name: "Add a filter" })).toBeTruthy()
    expect(within(inner).queryByRole("button", { name: "Add a group" })).toBeNull()
    // The view's own list and the group around it still offer one each.
    expect(screen.getAllByRole("button", { name: "Add a group" })).toHaveLength(2)
    expect(outer.contains(inner)).toBe(true)
  })

  it("takes a group away with its last filter, and a group left holding nothing with it", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} initial={{ sort: [], match: "all", filters: [item("a"), { match: "any", filters: [{ match: "all", filters: [item("b")] }] }] }} />)
    open()
    const [, inner] = groupsIn()
    fireEvent.click(within(inner).getByRole("button", { name: "Remove this filter" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [item("a")], match: "all" })
    expect(groupsIn()).toHaveLength(0)
  })

  it("takes a whole group away at once", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} initial={{ sort: [], match: "all", filters: [item("a"), { match: "any", filters: [item("b"), item("c")] }] }} />)
    open()
    fireEvent.click(within(groupsIn()[0]).getByRole("button", { name: "Remove this group" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [item("a")], match: "all" })
  })

  it("stops adding filters and groups at fifty, every group's together", () => {
    const changed = vi.fn()
    const many = Array.from({ length: 48 }, (_, i) => item(String(i)))
    render(<Holding onChange={changed} initial={{ sort: [], match: "all", filters: [...many, { match: "all", filters: [item("x")] }] }} />)
    open()
    expect(screen.getAllByRole("button", { name: "Add a filter" })).toHaveLength(2)
    fireEvent.click(within(groupsIn()[0]).getByRole("button", { name: "Add a filter" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [...many, { match: "all", filters: [item("x"), item("")] }], match: "all" })
    expect(screen.queryAllByRole("button", { name: "Add a filter" })).toHaveLength(0)
    expect(screen.queryAllByRole("button", { name: "Add a group" })).toHaveLength(0)
  })

  it("takes a date filter's day from the app's date field, never the browser's box", () => {
    // DESIGN-BUILD-20's SF2: the browser's own date box wrote "11/01/2026" with its own calendar glyph.
    render(<Holding initial={{ sort: [], match: "all", filters: [{ field: "due", op: "after", value: "2026-11-01" }] }} />)
    open()
    expect(document.querySelector('input[type="date"]')).toBeNull()
    expect(screen.getByRole("button", { name: "Value, Sun 1 Nov 2026" })).toBeTruthy()
  })

  it("says what a group's chip holds, and how they match, and takes it away", () => {
    const changed = vi.fn()
    render(<Holding onChange={changed} initial={{ sort: [], match: "all", filters: [{ match: "any", filters: [item("a"), item("b"), { match: "all", filters: [item("c")] }] }] }} />)
    expect(document.querySelector("[data-rule-chip]")?.textContent).toBe("Any of 3 filters")
    fireEvent.click(screen.getByRole("button", { name: "Remove the group of 3 filters" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [], match: "all" })
  })
})

describe("a people filter on me", () => {
  const more: TableField[] = [
    ...fields,
    { id: "maker", table_id: "t", name: "Made by", type: "created_by", config: "{}", position: 5 },
    { id: "editor", table_id: "t", name: "Edited by", type: "modified_by", config: "{}", position: 6 },
    // A name typed as text, which the server can't read as anyone.
    { id: "contact", table_id: "t", name: "Contact", type: "person", config: "{}", position: 7 },
  ]
  const on = (field: string, value = "") => ({ field, op: "contains" as const, value })

  it("offers me on people, created-by and edited-by fields alone", () => {
    render(<Holding of={more} initial={{ sort: [], match: "all", filters: ["item", "owners", "maker", "editor", "contact"].map((f) => on(f)) }} />)
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    expect(screen.getAllByRole("button", { name: "Me, whoever opens the view" })).toHaveLength(3)
    expect(screen.getAllByRole("textbox", { name: "Value" })).toHaveLength(5)
  })

  it("names me in the filter and its chip, until someone else is typed", () => {
    const changed = vi.fn()
    render(<Holding of={more} onChange={changed} initial={{ sort: [], match: "all", filters: [on("owners")] }} />)
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    fireEvent.click(screen.getByRole("button", { name: "Me, whoever opens the view" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [on("owners", "@me")], match: "all" })
    expect(screen.queryByRole("textbox", { name: "Value" })).toBeNull()
    expect(document.querySelector("[data-rule-chip]")?.textContent).toBe("Owners has me")
    fireEvent.click(screen.getByRole("button", { name: "Someone else: type a name" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [on("owners")], match: "all" })
    expect(screen.getByRole("textbox", { name: "Value" })).toBeTruthy()
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

// Tables T5c: a view read in windows is answered whole by the server, which
// counts its rows. Until it has, the bar says nothing of how many; a count
// that stopped at the server's cap says "+"; and there is no "Load all".
describe("the rows shown, in a view read in windows", () => {
  it("says nothing of how many until the server has counted them", () => {
    expect(rowsShownText(null, 0, 100_000, true)).toBeNull()
    expect(rowsShownText(1234, 1234, 100_000, true)).toBe("Showing 1,234 of 100,000 rows")
  })

  // airtable-03b (DB-42): while the server is still filling a formula the
  // view reads, no row shows yet, and the size is why it waits: the bar says
  // the view's rows, never "Showing 0 of", which reads as a filter hiding all.
  it("says the view's rows, not none of them, while a formula is still being filled", () => {
    expect(rowsShownText(0, 0, 100_000, true, false, true)).toBe("100,000 rows")
    expect(rowsShownText(null, 0, 100_000, true, false, true)).toBe("100,000 rows")
    expect(rowsShownText(null, 0, null, true, false, true)).toBeNull()
  })

  it("says a count that stopped at the server's cap is at least that", () => {
    expect(rowsShownText(100_000, 100_000, 250_000, true, true)).toBe("Showing 100,000+ of 250,000 rows")
  })

  it("offers Try again when a window couldn't be read, counted or not, and never Load all", () => {
    const onRetry = vi.fn()
    const { rerender } = render(<ViewRulesBar fields={fields} rules={NO_RULES} onChange={vi.fn()} shown={null} held={0} total={1200} loading={{ reading: false, failed: true, onRetry }} />)
    expect(document.querySelector("[data-rows-shown]")?.textContent).toBe("Couldn't load the rows. Try again")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalled()
    rerender(<ViewRulesBar fields={fields} rules={NO_RULES} onChange={vi.fn()} shown={600} held={600} total={1200} loading={{ reading: true, failed: false, onRetry }} />)
    expect(document.querySelector("[data-rows-shown]")?.textContent).toBe("Showing 600 of 1,200 rows · Loading…")
    expect(screen.queryByRole("button", { name: "Load all" })).toBeNull()
  })
})

// DESIGN-BUILD-20 (26 Oct): the count came only once a view's rules landed, and at 390 it wrapped the bar
// and moved the view under it. Until how many rows show is known, the bar holds the count's place.
describe("the count's place, while how many rows show isn't known", () => {
  const filtered: ViewRules = { sort: [], filters: [{ field: "stage", op: "is", value: "Live" }], match: "all" }

  it("holds it with the count's words, unseen, then says the count in the same element", () => {
    const { rerender } = render(<ViewRulesBar fields={fields} rules={filtered} onChange={vi.fn()} shown={null} held={4} total={4} />)
    const place = document.querySelector("[data-rows-waiting]")
    expect(place?.querySelector("[aria-hidden='true']")?.textContent).toBe("Showing 3 of 4 rows")
    expect(document.querySelector("[data-rows-shown]")).toBeNull()
    rerender(<ViewRulesBar fields={fields} rules={filtered} onChange={vi.fn()} shown={2} held={4} total={4} />)
    expect(document.querySelector("[data-rows-shown]")).toBe(place)
    expect(place?.textContent).toBe("Showing 2 of 4 rows")
    expect(document.querySelector("[data-rows-waiting]")).toBeNull()
  })

  it("holds none when no count will show: every row held, and no filter", () => {
    render(<ViewRulesBar fields={fields} rules={NO_RULES} onChange={vi.fn()} shown={null} held={8} total={8} />)
    expect(document.querySelector("[data-rows-waiting], [data-rows-shown]")).toBeNull()
  })

  it("offers nothing from the place it holds: Load all comes with the count", () => {
    const loading = { reading: false, failed: false, onLoadAll: vi.fn(), onRetry: vi.fn() }
    render(<ViewRulesBar fields={fields} rules={NO_RULES} onChange={vi.fn()} shown={null} held={500} total={1200} loading={loading} />)
    expect(document.querySelector("[data-rows-waiting]")?.textContent).toBe("Showing 500 of 1,200 rows · Load all")
    expect(screen.queryByRole("button", { name: "Load all" })).toBeNull()
  })

  it("holds it as wide as the count can come to be", () => {
    expect(rowsShownPlaceholder(true, 1200, 1200, true)).toBe("Showing 1,199 of 1,200 rows")
    expect(rowsShownPlaceholder(false, 1200, 1200, true)).toBeNull()
    expect(rowsShownPlaceholder(false, 500, 1200, false)).toBe("Showing 500 of 1,200 rows")
    expect(rowsShownPlaceholder(true, 500, 1200, false)).toBe("Showing 499 in the 500 of 1,200 rows loaded")
    // A filtered view read in windows, before the server has counted it: the table's rows bound it.
    expect(rowsShownPlaceholder(true, 500, 100_000, true)).toBe("Showing 99,999 of 100,000 rows")
    expect(rowsShownPlaceholder(true, 0, 0, true)).toBeNull()
  })
})

// Tables V2b (DESIGN-BUILD-21's rulings): "Group by" is the Sort menu's first
// part, under "Group and sort", up to three levels; a grouping is a chip.
describe("grouping a table", () => {
  const more: TableField[] = [...fields, { id: "paid", table_id: "t", name: "Paid", type: "checkbox", config: "{}", position: 5 }]

  it("groups by a field that groups, then by others, three deep, a date by its period", () => {
    const changed = vi.fn()
    render(<Holding of={more} onChange={changed} />)
    fireEvent.click(screen.getByRole("button", { name: "Sort and group" }))
    expect(screen.getByRole("heading", { name: "Group and sort" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add a group" }))
    fireEvent.click(screen.getByRole("combobox", { name: "Group by" }))
    // Text and people don't group yet.
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Cost", "Stage", "Due", "Paid"])
    fireEvent.click(screen.getByRole("option", { name: "Stage" }))
    expect(changed).toHaveBeenLastCalledWith({ sort: [], filters: [], match: "all", groups: [{ field: "stage", dir: "asc" }] })
    fireEvent.click(screen.getByRole("button", { name: "Add a subgroup" }))
    choose("Then group by", "Due")
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ groups: [{ field: "stage", dir: "asc" }, { field: "due", dir: "asc", granularity: "month" }] }))
    choose("Period", "Week")
    fireEvent.click(screen.getAllByRole("combobox", { name: "Group order" })[0])
    fireEvent.click(screen.getByRole("option", { name: "Last → first" }))
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ groups: [{ field: "stage", dir: "desc" }, { field: "due", dir: "asc", granularity: "week" }] }))
    fireEvent.click(screen.getByRole("button", { name: "Add a subgroup" }))
    expect(changed.mock.lastCall?.[0].groups).toHaveLength(3)
    expect(screen.queryByRole("button", { name: "Add a subgroup" })).toBeNull()
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this group" })[0])
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ groups: [{ field: "due", dir: "asc", granularity: "week" }, { field: "cost", dir: "asc" }] }))
  })

  it("shows a grouping as a chip that opens the menu, and drops it, or every rule, at once", () => {
    const changed = vi.fn()
    const grouped: ViewRules = { ...NO_RULES, sort: [{ field: "cost", dir: "asc" }], groups: [{ field: "stage", dir: "asc" }, { field: "due", dir: "desc", granularity: "year" }] }
    const { unmount } = render(<Holding onChange={changed} initial={grouped} />)
    const chip = [...document.querySelectorAll("[data-rule-chip]")].find((c) => c.textContent?.includes("Grouped by"))
    // Every level, in order, and cut only where the row runs out (DB-23).
    expect(chip?.textContent).toBe("Grouped by Stage › Due")
    expect(chip?.className).toContain("max-w-full")
    fireEvent.click(within(chip as HTMLElement).getByText("Grouped by Stage › Due"))
    expect(screen.getByRole("heading", { name: "Group and sort" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Remove the grouping" }))
    expect(changed).toHaveBeenLastCalledWith({ ...NO_RULES, sort: [{ field: "cost", dir: "asc" }] })
    unmount()
    render(<Holding onChange={changed} initial={grouped} />)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(changed).toHaveBeenLastCalledWith(NO_RULES)
  })
})
