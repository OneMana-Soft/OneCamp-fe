import { describe, expect, it } from "vitest"

import type { TableField } from "@/services/tableService"
import { tintedFields } from "./optionChip"

const field = (id: string, type: string, position: number, tinted?: boolean): TableField =>
  ({ id, name: id, type, position, config: JSON.stringify(tinted === undefined ? {} : { tinted }) }) as unknown as TableField

// The rivals review (16 Oct 2026): Notion's tinted select pills read state
// faster than our neutral chips with a dot. One tinted column a table.
describe("the columns whose chips are tinted", () => {
  it("are, by default, the table's first single select: the one a board groups by", () => {
    const fields = [field("name", "text", 0), field("tags", "multi_select", 1), field("stage", "select", 2), field("owner", "select", 3)]
    expect([...tintedFields(fields)]).toEqual(["stage"])
  })

  it("are the ones that switched it on, once any has, and no default beside them", () => {
    const fields = [field("stage", "select", 0), field("priority", "select", 1, true)]
    expect([...tintedFields(fields)]).toEqual(["priority"])
  })

  it("leave out a first select that switched it off", () => {
    expect([...tintedFields([field("stage", "select", 0, false), field("owner", "select", 1)])]).toEqual([])
  })

  it("are none in a table without a select", () => {
    expect(tintedFields([field("name", "text", 0), field("tags", "multi_select", 1)]).size).toBe(0)
  })
})
