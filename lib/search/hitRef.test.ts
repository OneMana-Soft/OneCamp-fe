import { describe, expect, it } from "vitest"
import { hitRef } from "@/lib/search/hitRef"
import type { SearchResult } from "@/services/searchService"

// A workspace search hit as the thing it names, for every picker that links to one (the entity-link search, a
// table's link cell): by the ids the search index carries (models/openSearch: a task's and a project's are
// task_id and project_id).
const hit = (r: object) => r as SearchResult

describe("a search hit as the thing it names", () => {
  it("reads a doc, a board, a task and a project by their ids, and an untitled one as such", () => {
    expect(hitRef(hit({ type: "doc", doc: { doc_uuid: "d1", doc_title: "Brief" } }))).toEqual({ kind: "doc", id: "d1", title: "Brief" })
    expect(hitRef(hit({ type: "board", board: { board_uuid: "b1" } }))).toEqual({ kind: "board", id: "b1", title: "Untitled board" })
    expect(hitRef(hit({ type: "task", task: { task_id: "t1", task_name: "Book the venue" } }))).toEqual({ kind: "task", id: "t1", title: "Book the venue" })
    expect(hitRef(hit({ type: "project", project: { project_id: "p1", project_name: "Launch" } }))).toEqual({ kind: "project", id: "p1", title: "Launch" })
  })

  it("names nothing for a hit with no id, or of a kind nothing links to", () => {
    expect(hitRef(hit({ type: "task", task: { task_name: "No id" } }))).toBeNull()
    expect(hitRef(hit({ type: "channel", channel: { channel_uuid: "c1" } }))).toBeNull()
  })
})
