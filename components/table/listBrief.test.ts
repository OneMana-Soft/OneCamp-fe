import { describe, expect, it } from "vitest"
import { brief } from "@/components/table/TableRowList"
import type { TableField } from "@/services/tableService"

// DB-24's M1 (B4): a list row, and a gallery card, printed an attachments field as "[object Object]".
describe("a value as one short line", () => {
  const pics: TableField = { id: "pics", table_id: "t", name: "Pics", type: "attachment", config: "{}", position: 1 }
  it("says how many files an attachments field holds", () => {
    expect(brief(pics, [{ id: "f1", name: "a.png" }, { id: "f2", name: "b.pdf" }], false)).toBe("2 files")
    expect(brief(pics, [{ id: "f1", name: "a.png" }], false)).toBe("1 file")
    expect(brief(pics, [], false)).toBeNull()
  })
})
