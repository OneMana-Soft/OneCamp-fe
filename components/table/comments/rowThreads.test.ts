import { describe, expect, it } from "vitest"
import { cellOf, commentCounts, threadPlace } from "./rowThreads"
import { commentsMessageRow, onRowComments, rowCommentsChanged } from "@/lib/tables/rowComments"
import type { ThreadView } from "@/components/threads/types"

const fields = [
  { id: "status", name: "Status" },
  { id: "owner", name: "Owner" },
]
const thread = (over: Partial<ThreadView>): ThreadView =>
  ({ id: "t", resource_kind: "table_row", resource_uuid: "r1", anchor: { kind: "none" }, status: "open", comments: [], ...over }) as ThreadView
const said = (n: number) => Array.from({ length: n }, (_, i) => ({ comment_uuid: `c${i}` })) as ThreadView["comments"]

describe("a row's threads, in its record's words", () => {
  it("says where each is: the row, a cell by its column, or a column since deleted", () => {
    expect(threadPlace(thread({}), fields)).toBe("On this row")
    expect(threadPlace(thread({ anchor: { kind: "cell", meta: { field: "status" } } }), fields)).toBe("On Status")
    expect(threadPlace(thread({ anchor: { kind: "cell", meta: { field: "gone" } } }), fields)).toBe("On a deleted column")
    expect(cellOf(thread({ anchor: { kind: "cell", meta: {} } }))).toBeNull()
    expect(cellOf(thread({ anchor: { kind: "cell", meta: { field: 7 } } }))).toBeNull()
  })

  it("counts the comments of open threads, in all and on each cell; resolved ones aren't counted", () => {
    const { total, byField } = commentCounts([
      thread({ comments: said(2) }),
      thread({ anchor: { kind: "cell", meta: { field: "status" } }, comments: said(3) }),
      thread({ anchor: { kind: "cell", meta: { field: "status" } }, comments: said(1) }),
      thread({ anchor: { kind: "cell", meta: { field: "owner" } }, status: "resolved", comments: said(4) }),
    ])
    expect(total).toBe(6)
    expect(byField).toEqual({ status: 4 })
  })
})

describe("a table's live comments messages", () => {
  it("names the row a comments message is about, and nothing else", () => {
    expect(commentsMessageRow({ action: "comments", row_id: "r1" })).toBe("r1")
    expect(commentsMessageRow({ action: "updated", row_id: "r1" })).toBeNull()
    expect(commentsMessageRow({ action: "comments" })).toBeNull()
    expect(commentsMessageRow({ action: "comments", row_id: 3 })).toBeNull()
    expect(commentsMessageRow(undefined)).toBeNull()
  })

  it("tells what shows a row's threads, until it stops listening", () => {
    const heard: string[] = []
    const stopOne = onRowComments("r1", () => heard.push("one"))
    const stopOther = onRowComments("r2", () => heard.push("other"))
    rowCommentsChanged("r1")
    stopOne()
    rowCommentsChanged("r1")
    rowCommentsChanged("r2")
    stopOther()
    expect(heard).toEqual(["one", "other"])
  })
})
