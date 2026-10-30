import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { RowHeightMenu } from "@/components/table/TableMenus"
import { ColourRules } from "@/components/table/rules/ColourRules"
import type { CampHue } from "@/lib/campHue"
import type { TableField } from "@/services/tableService"

// Tables V3: colours are chosen where rows' drawing is (the rows menu): none,
// by a choice field, or by rules edited in a dialog (a sheet on a phone).

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ label: "Won" }] }), position: 1 },
  { id: "state", table_id: "t", name: "State", type: "status", config: "{}", position: 2 },
]
afterEach(cleanup)

describe("colouring rows from the rows menu", () => {
  it("offers none, each choice field and rules, checks the height and the colours on, and opens the rules' dialog", async () => {
    const onColors = vi.fn()
    render(<RowHeightMenu trigger={<button type="button">Rows</button>} open onOpenChange={() => {}} height="medium" onHeight={() => {}} list={null} onList={() => {}} fields={fields} colors={{ field: "stage" }} onColors={onColors} />)
    const items = screen.getAllByRole("menuitemradio")
    expect(items.map((i) => i.textContent)).toEqual(["Short32", "Medium40", "Tall64", "Extra tall104", "None", "By Stage", "By State", "By rules…"])
    expect(items.filter((i) => i.getAttribute("aria-checked") === "true").map((i) => i.textContent)).toEqual(["Medium40", "By Stage"])
    fireEvent.click(screen.getByRole("menuitemradio", { name: "By State" }))
    expect(onColors).toHaveBeenCalledWith({ field: "state" })
    fireEvent.click(screen.getByRole("menuitemradio", { name: "By rules…" }))
    expect(await screen.findByRole("dialog", { name: "Colour rows and cells" })).toBeTruthy()
    expect(onColors).toHaveBeenCalledTimes(1)
  })
})

describe("the colour rules dialog", () => {
  it("edits rules as they change: a hue, another rule, one taken away", () => {
    const onChange = vi.fn()
    render(<ColourRules fields={fields} colors={null} onChange={onChange} onClose={() => {}} />)
    expect(screen.getByRole("dialog", { name: "Colour rows and cells" })).toBeTruthy()
    // Opening it changes nothing; a rule's colour is one of the six, never none.
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole("radio", { name: "No colour" })).toBeNull()
    const waiting = { field: "item", op: "contains", value: "" }
    fireEvent.click(screen.getByRole("radio", { name: "Berry" }))
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "berry", match: "all", filters: [waiting] }] })
    fireEvent.click(screen.getByRole("button", { name: "Add a rule" }))
    // The next rule takes the next swatch along, as the picker draws them.
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "berry", match: "all", filters: [waiting] }, { hue: "sun", match: "all", filters: [waiting] }] })
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this rule" })[0])
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "sun", match: "all", filters: [waiting] }] })
    fireEvent.click(screen.getByRole("button", { name: "Remove this rule" }))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByText("No rule colours a row or a cell.")).toBeTruthy()
  })

  // CR-63 (V3 SF2): rules were kept by their place, so taking one out handed
  // its box, and whatever it was doing, to the rule after it.
  it("keeps each rule's own box when a rule before it is taken out", () => {
    const rule = (hue: CampHue) => ({ hue, match: "all" as const, filters: [{ field: "item", op: "contains" as const, value: hue }] })
    render(<ColourRules fields={fields} colors={{ rules: [rule("berry"), rule("sun")] }} onChange={() => {}} onClose={() => {}} />)
    const second = screen.getByRole("group", { name: "Rule 2, Sun" })
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this rule" })[0])
    expect(screen.getByRole("group", { name: "Rule 1, Sun" })).toBe(second)
  })
})

// gsheets-formatting-01: a rule colours a row or one field's cell, a number's
// filter compares with another field, and scales shade a number's cells.
describe("colouring cells", () => {
  const deal: TableField[] = [
    ...fields,
    { id: "amount", table_id: "t", name: "Amount", type: "number", config: "{}", position: 3 },
    { id: "budget", table_id: "t", name: "Budget", type: "number", config: "{}", position: 4 },
  ]
  /** Picks an option of a rule's select (RuleSelect: a combobox and its listbox). */
  const pick = (scope: HTMLElement, label: string, option: string) => {
    fireEvent.click(within(scope).getByRole("combobox", { name: label }))
    fireEvent.click(screen.getByRole("option", { name: option }))
  }

  it("a rule colours the whole row, or one field's cell", () => {
    const onChange = vi.fn()
    render(<ColourRules fields={deal} colors={null} onChange={onChange} onClose={() => {}} />)
    const rule = screen.getByRole("group", { name: "Rule 1, Moss" })
    expect(within(rule).getByRole("combobox", { name: "What rule 1 colours" }).textContent).toContain("The whole row")
    pick(rule, "What rule 1 colours", "Amount's cell")
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "moss", match: "all", filters: [{ field: "item", op: "contains", value: "" }], cell: "amount" }] })
    pick(rule, "What rule 1 colours", "The whole row")
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "moss", match: "all", filters: [{ field: "item", op: "contains", value: "" }] }] })
  })

  it("a number's filter compares with another number of the row, in place of a value", () => {
    const onChange = vi.fn()
    render(<ColourRules fields={deal} colors={null} onChange={onChange} onClose={() => {}} />)
    const rule = screen.getByRole("group", { name: "Rule 1, Moss" })
    // Text compares with no field.
    expect(within(rule).queryByRole("combobox", { name: "Compare with" })).toBeNull()
    pick(rule, "Field", "Amount")
    pick(rule, "Compare with", "Budget")
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "moss", match: "all", filters: [{ field: "amount", op: "is", value: "", of: "budget" }] }] })
    expect(within(rule).queryByRole("spinbutton", { name: "Value" })).toBeNull()
    pick(rule, "Condition", ">")
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "moss", match: "all", filters: [{ field: "amount", op: "gt", value: "", of: "budget" }] }] })
    pick(rule, "Compare with", "a value")
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ hue: "moss", match: "all", filters: [{ field: "amount", op: "gt", value: "" }] }] })
    expect(within(rule).getByRole("spinbutton", { name: "Value" })).toBeTruthy()
  })

  it("adds a colour scale a number field at a time, each its own colour, and takes one away", () => {
    const onChange = vi.fn()
    render(<ColourRules fields={deal} colors={null} onChange={onChange} onClose={() => {}} />)
    // Its rule waiting for a value goes: the scales alone colour.
    fireEvent.click(screen.getByRole("button", { name: "Remove this rule" }))
    const scales = screen.getByRole("region", { name: "Colour scales" })
    fireEvent.click(within(scales).getByRole("button", { name: "Add a colour scale" }))
    expect(onChange).toHaveBeenLastCalledWith({ rules: [], scales: [{ field: "amount", hue: "moss" }] })
    fireEvent.click(within(scales).getByRole("button", { name: "Add a colour scale" }))
    expect(onChange).toHaveBeenLastCalledWith({ rules: [], scales: [{ field: "amount", hue: "moss" }, { field: "budget", hue: "sun" }] })
    // Every number field has its scale.
    expect(within(scales).queryByRole("button", { name: "Add a colour scale" })).toBeNull()
    fireEvent.click(within(screen.getByRole("group", { name: "Scale on Budget, Sun" })).getByRole("radio", { name: "Berry" }))
    expect(onChange).toHaveBeenLastCalledWith({ rules: [], scales: [{ field: "amount", hue: "moss" }, { field: "budget", hue: "berry" }] })
    fireEvent.click(screen.getByRole("button", { name: "Remove the scale on Amount" }))
    expect(onChange).toHaveBeenLastCalledWith({ rules: [], scales: [{ field: "budget", hue: "berry" }] })
    fireEvent.click(screen.getByRole("button", { name: "Remove the scale on Budget" }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it("keeps a view's scales when its rows are coloured by a field, or by none", () => {
    const onColors = vi.fn()
    const scales = [{ field: "amount", hue: "sky" as const }]
    render(<RowHeightMenu trigger={<button type="button">Rows</button>} open onOpenChange={() => {}} height="medium" onHeight={() => {}} list={null} onList={() => {}} fields={deal} colors={{ rules: [], scales }} onColors={onColors} />)
    expect(screen.getByRole("menuitemradio", { name: "None" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("menuitemradio", { name: "By Stage" }))
    expect(onColors).toHaveBeenLastCalledWith({ field: "stage", scales })
  })
})
