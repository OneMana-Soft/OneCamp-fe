import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import type { TableField } from "@/services/tableService"

const field = (id: string, name: string, type: TableField["type"], config: object = {}): TableField => ({
  id,
  table_id: "t",
  name,
  type,
  config: JSON.stringify(config),
  position: 0,
})

// What the server has: three tables, one of them someone else's, the fields of
// Vendors, and who's reading.
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_is_admin: false } } }),
  useFetch: (url: string) => {
    if (url === "/tables")
      return {
        data: {
          data: [
            { id: "t", name: "Budget", created_by: "me", visibility: "workspace" },
            { id: "v", name: "Vendors", created_by: "me", visibility: "workspace" },
            { id: "x", name: "Theirs", created_by: "someone", visibility: "workspace" },
            { id: "s", name: "Salaries", created_by: "me", visibility: "private" },
          ],
        },
        isLoading: false,
      }
    if (url === "/tables/v/fields")
      return {
        data: {
          data: [
            field("vname", "Name", "text"),
            field("rating", "Rating", "number"),
            field("active", "Active", "checkbox"),
            field("tags", "Tags", "multi_select"),
            field("spend", "Spend", "rollup", { relation: "orders", field: "amount", aggregate: "sum", result: "number" }),
            field("tier", "Tier", "select", { options: [{ label: "Gold" }, { label: "Silver" }] }),
          ],
        },
        isLoading: false,
      }
    return { data: undefined, isLoading: false }
  },
}))

import { RelationSettings, RollupSettings, relationDraftOf, rollupConfigOf, rollupDraftOf, rollupReady, type RelationDraft, type RollupDraft } from "@/components/table/LinkSettings"

/** Chooses an option from one of the settings' selects (the app's), named by its label. */
function choose(label: string, option: string | RegExp) {
  const trigger = screen.getByRole("combobox", { name: label })
  act(() => {
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
  })
  const item = screen.getByRole("option", { name: option })
  act(() => {
    fireEvent.keyDown(item, { key: "Enter" })
  })
}

/** The options a select offers, opened and closed again. */
function optionsOf(label: string): string[] {
  const trigger = screen.getByRole("combobox", { name: label })
  act(() => {
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
  })
  const names = screen.getAllByRole("option").map((o) => o.textContent ?? "")
  act(() => {
    fireEvent.keyDown(screen.getAllByRole("option")[0], { key: "Escape" })
  })
  return names
}


function Relation({ onChange, made, tableId = "t" }: { onChange: (d: RelationDraft) => void; made?: TableField; tableId?: string }) {
  const [draft, setDraft] = React.useState(relationDraftOf(made))
  return (
    <RelationSettings
      tableId={tableId}
      field={made}
      draft={draft}
      onChange={(d) => {
        setDraft(d)
        onChange(d)
      }}
    />
  )
}

function Rollup({ fields, onChange, initial }: { fields: TableField[]; onChange: (d: RollupDraft) => void; initial?: RollupDraft }) {
  const [draft, setDraft] = React.useState<RollupDraft>(initial ?? { relation: "", field: "", aggregate: "" })
  return (
    <RollupSettings
      fields={fields}
      draft={draft}
      onChange={(d) => {
        setDraft(d)
        onChange(d)
      }}
    />
  )
}

afterEach(cleanup)

describe("a relation's settings", () => {
  it("link to a table's rows, shown there too unless you say not", () => {
    const changed = vi.fn()
    render(<Relation onChange={changed} />)
    expect(optionsOf("Table")).toContain("Budget (this table)")
    choose("Table", "Vendors")
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "table", table_id: "v", two_way: true })
    fireEvent.click(screen.getByLabelText("Also show these links in Vendors"))
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "table", table_id: "v", two_way: false })
  })

  it("show links only in a table the reader can change", () => {
    const changed = vi.fn()
    render(<Relation onChange={changed} />)
    choose("Table", "Theirs")
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "table", table_id: "x", two_way: false })
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true)
  })

  it("can still link to OneCamp items", () => {
    const changed = vi.fn()
    render(<Relation onChange={changed} />)
    choose("Links to", "Tasks")
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "task" })
    expect(screen.queryByLabelText("Table")).toBeNull()
  })

  it("keep the table a link was made with", () => {
    render(<Relation onChange={vi.fn()} made={field("vendor", "Vendor", "relation", { relation_target: "table", table_id: "v", table_name: "Vendors" })} />)
    expect(screen.getByText("Rows of Vendors")).toBeTruthy()
    expect(screen.queryByLabelText("Links to")).toBeNull()
  })

  it("can show a link made one way in its table later", () => {
    const changed = vi.fn()
    render(<Relation onChange={changed} made={field("vendor", "Vendor", "relation", { relation_target: "table", table_id: "v", table_name: "Vendors" })} />)
    const box = screen.getByLabelText("Also show these links in Vendors") as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "table", table_id: "v", two_way: true })
  })

  it("say when a link already shows in its table", () => {
    render(
      <Relation
        onChange={vi.fn()}
        made={field("vendor", "Vendor", "relation", { relation_target: "table", table_id: "v", table_name: "Vendors", inverse: "back" })}
      />,
    )
    expect(screen.getByText(/These links show in Vendors too/)).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("warn that a private table's name shows where its links do", () => {
    render(<Relation onChange={vi.fn()} tableId="s" />)
    choose("Table", "Vendors")
    expect(screen.getByText(/Salaries is private, but everyone who can open Vendors will see a column there named after it/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText("Also show these links in Vendors"))
    expect(screen.queryByText(/Salaries is private/)).toBeNull()
  })
})

describe("a rollup's settings", () => {
  const vendor = field("vendor", "Vendor", "relation", { relation_target: "table", table_id: "v", table_name: "Vendors" })

  it("need a relation to a table first", () => {
    render(<Rollup fields={[field("cost", "Cost", "number")]} onChange={vi.fn()} />)
    expect(screen.getByText(/Add a relation to a table/)).toBeTruthy()
  })

  it("count the rows, or add up a field the ways that fit it", () => {
    const changed = vi.fn()
    render(<Rollup fields={[vendor]} onChange={changed} />)
    choose("Rows of", "Vendor")
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "", aggregate: "count" })
    // Another rollup too, by what it gives (airtable-02).
    expect(optionsOf("Field")).toEqual(["None: just the rows", "Name", "Rating", "Active", "Tags", "Spend", "Tier"])
    choose("Field", "Spend")
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "spend", aggregate: "sum" })
    expect(optionsOf("Calculate")).toContain("Largest")
    choose("Field", "Rating")
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "rating", aggregate: "sum" })
    expect(optionsOf("Calculate")).toContain("Average")
    choose("Field", "Active")
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "active", aggregate: "checked" })
    expect(optionsOf("Calculate")).not.toContain("Sum")
    // None, just the rows, counts them again.
    choose("Field", "None: just the rows")
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "", aggregate: "count" })
  })

  it("add up with a formula over values (B2)", () => {
    const changed = vi.fn()
    render(<Rollup fields={[vendor]} onChange={changed} />)
    choose("Rows of", "Vendor")
    choose("Field", "Rating")
    choose("Calculate", "With a formula")
    expect(rollupReady(changed.mock.lastCall![0])).toBe(false)
    fireEvent.change(screen.getByRole("textbox", { name: "Formula" }), { target: { value: "SUM(values) * 1.18" } })
    const d = changed.mock.lastCall![0] as RollupDraft
    expect(d).toMatchObject({ aggregate: "formula", formula: "SUM(values) * 1.18" })
    expect(rollupReady(d)).toBe(true)
  })

  it("add up only the linked rows that meet their conditions, with the grid's own filters (B2)", () => {
    const changed = vi.fn()
    render(<Rollup fields={[vendor]} onChange={changed} />)
    choose("Rows of", "Vendor")
    fireEvent.click(screen.getByRole("button", { name: "Add a condition" }))
    expect((changed.mock.lastCall![0] as RollupDraft).where).toEqual([{ field: "vname", op: "contains", value: undefined }])
    // The linked rows' own values only: not what other rows add up to (the server's workedOutElsewhere).
    expect(optionsOf("Condition's field")).not.toContain("Spend")
    // A checkbox is ticked or not, which the server reads as "true" or not; no value to type.
    choose("Condition's field", "Active")
    expect((changed.mock.lastCall![0] as RollupDraft).where).toEqual([{ field: "active", op: "eq", value: "true" }])
    expect(screen.queryByRole("textbox", { name: "Condition's value" })).toBeNull()
    choose("Condition's field", "Rating")
    choose("Condition", "≥")
    fireEvent.change(screen.getByRole("textbox", { name: "Condition's value" }), { target: { value: "4" } })
    expect((changed.mock.lastCall![0] as RollupDraft).where).toEqual([{ field: "rating", op: "gte", value: "4" }])
    fireEvent.click(screen.getByRole("button", { name: "Remove the condition" }))
    expect((changed.mock.lastCall![0] as RollupDraft).where).toEqual([])
  })

  // airtable-02: Airtable's rollups sort the linked records they add up, either way, and can take only the first N.
  it("sort the linked rows by one of their fields, either way, and add up only the first N", () => {
    const changed = vi.fn()
    render(<Rollup fields={[vendor]} onChange={changed} />)
    choose("Rows of", "Vendor")
    choose("Field", "Rating")
    // In link order until a field orders them; not a rollup, nor a list of choices, which no view sorts by (the server's sortProblem).
    expect(optionsOf("Sort the rows by")).toEqual(["Link order", "Name", "Rating", "Active", "Tier"])
    expect(screen.queryByRole("combobox", { name: "Direction" })).toBeNull()
    choose("Sort the rows by", "Rating")
    expect(optionsOf("Direction")).toEqual(["1 → 9", "9 → 1"])
    choose("Direction", "9 → 1")
    const first = screen.getByRole("spinbutton", { name: "Only the first rows" })
    fireEvent.change(first, { target: { value: "3" } })
    expect(changed.mock.lastCall![0]).toMatchObject({ sort: "rating", desc: true, limit: 3 })
    // Not a whole number from 1: every row.
    fireEvent.change(first, { target: { value: "0" } })
    expect((changed.mock.lastCall![0] as RollupDraft).limit).toBeUndefined()
    choose("Sort the rows by", "Link order")
    expect(changed.mock.lastCall![0]).toMatchObject({ sort: undefined, desc: undefined })
    expect(screen.queryByRole("combobox", { name: "Direction" })).toBeNull()
    // A choice in its options' order, as a view sorts it, and in those words.
    choose("Sort the rows by", "Tier")
    expect(optionsOf("Direction")).toEqual(["First → last", "Last → first"])
  })

  // CR-77 MF2: a saved sort by a field since deleted, or one it can't sort by, says so, the reason first (DB-30 M2: the select truncates); another order clears it.
  it("say a sort by a field it can't use is one, and clear it when another order is chosen", () => {
    const sortBy = () => screen.getByRole("combobox", { name: "Sort the rows by" }).textContent
    for (const [sort, said] of [
      ["gone", "Can't sort by a deleted field"],
      ["tags", "Can't sort by Tags"],
    ]) {
      const changed = vi.fn()
      render(<Rollup fields={[vendor]} onChange={changed} initial={{ relation: "vendor", field: "rating", aggregate: "sum", sort, desc: true }} />)
      expect(sortBy()).toBe(said)
      expect(screen.queryByRole("combobox", { name: "Direction" })).toBeNull()
      choose("Sort the rows by", "Link order")
      expect(changed.mock.lastCall![0]).toMatchObject({ sort: undefined, desc: undefined })
      expect(sortBy()).toBe("Link order")
      cleanup()
    }
  })

  it("save their sort, its direction and their first N only when they have them", () => {
    const saved = field("top", "Top", "rollup", { relation: "vendor", field: "rating", aggregate: "sum", sort: "rating", desc: true, limit: 3 })
    const d = rollupDraftOf(saved)
    expect(d).toMatchObject({ sort: "rating", desc: true, limit: 3 })
    expect(rollupConfigOf(d, saved)).toEqual({ relation: "vendor", field: "rating", aggregate: "sum", sort: "rating", desc: true, limit: 3 })
    expect(rollupConfigOf({ ...d, sort: undefined, limit: undefined }, saved)).toEqual({ relation: "vendor", field: "rating", aggregate: "sum" })
  })

  it("save their formula only for a formula, no empty conditions, and keep the field's format", () => {
    const saved = field("spend", "Spend", "rollup", { relation: "vendor", field: "rating", aggregate: "sum", formula: "old", where: [{ field: "active", op: "eq", value: "true" }], format: { currency: "INR" } })
    const d = rollupDraftOf(saved)
    expect(d.where).toEqual([{ field: "active", op: "eq", value: "true" }])
    expect(rollupConfigOf({ ...d, where: [...d.where!, { field: "", op: "" }] }, saved)).toEqual({
      relation: "vendor",
      field: "rating",
      aggregate: "sum",
      where: [{ field: "active", op: "eq", value: "true" }],
      format: { currency: "INR" },
    })
  })
})
