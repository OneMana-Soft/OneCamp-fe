import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
        data: { data: [field("vname", "Name", "text"), field("rating", "Rating", "number"), field("active", "Active", "checkbox"), field("spend", "Spend", "rollup")] },
        isLoading: false,
      }
    return { data: undefined, isLoading: false }
  },
}))

import { RelationSettings, RollupSettings, relationDraftOf, type RelationDraft, type RollupDraft } from "@/components/table/LinkSettings"

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

function Rollup({ fields, onChange }: { fields: TableField[]; onChange: (d: RollupDraft) => void }) {
  const [draft, setDraft] = React.useState<RollupDraft>({ relation: "", field: "", aggregate: "" })
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
    expect(screen.getByRole("option", { name: "Budget (this table)" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Table"), { target: { value: "v" } })
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "table", table_id: "v", two_way: true })
    fireEvent.click(screen.getByLabelText("Also show these links in Vendors"))
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "table", table_id: "v", two_way: false })
  })

  it("show links only in a table the reader can change", () => {
    const changed = vi.fn()
    render(<Relation onChange={changed} />)
    fireEvent.change(screen.getByLabelText("Table"), { target: { value: "x" } })
    expect(changed).toHaveBeenLastCalledWith({ relation_target: "table", table_id: "x", two_way: false })
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true)
  })

  it("can still link to OneCamp items", () => {
    const changed = vi.fn()
    render(<Relation onChange={changed} />)
    fireEvent.change(screen.getByLabelText("Links to"), { target: { value: "task" } })
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
    fireEvent.change(screen.getByLabelText("Table"), { target: { value: "v" } })
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
    fireEvent.change(screen.getByLabelText("Rows of"), { target: { value: "vendor" } })
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "", aggregate: "count" })
    // A rollup can't add up another rollup.
    expect(screen.queryByRole("option", { name: "Spend" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "rating" } })
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "rating", aggregate: "sum" })
    expect(screen.getByRole("option", { name: "Average" })).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "active" } })
    expect(changed).toHaveBeenLastCalledWith({ relation: "vendor", field: "active", aggregate: "checked" })
    expect(screen.queryByRole("option", { name: "Sum" })).toBeNull()
  })
})
