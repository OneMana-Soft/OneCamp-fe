import { describe, expect, it } from "vitest"

import type { SearchResult } from "@/services/searchService"
import { groupResults, resultTime, scopeCounts, sortResults, visibleScopes } from "@/lib/search/scopes"

const task = (n: number, t = n) => ({ type: "task", task: { task_id: `t${n}`, task_name: `Task ${n}`, created_date: t } }) as SearchResult
const doc = { type: "doc", doc: { doc_uuid: "d1", doc_title: "Q4 launch plan", created_date: 5 } } as SearchResult
const post = { type: "post", post: { post_id: "p1", post_body: "Release candidate", created_date: 9 } } as SearchResult

describe("search scopes and groups", () => {
  it("counts each scope and shows only the chips that hold something, All always", () => {
    const rs = [task(1), doc, post]
    expect(scopeCounts(rs)).toMatchObject({ all: 3, tasks: 1, docs: 1, messages: 1, people: 0 })
    expect(visibleScopes(rs).map((s) => s.id)).toEqual(["all", "messages", "tasks", "docs"])
    expect(visibleScopes([]).map((s) => s.id)).toEqual(["all"])
  })

  it("groups All by type, three of each, with a Show all", () => {
    const rs = [task(1), task(2), doc, task(3), task(4), post]
    const groups = groupResults(rs, "all")
    expect(groups.map((g) => g.scope)).toEqual(["messages", "tasks", "docs"])
    const tasks = groups.find((g) => g.scope === "tasks")!
    expect(tasks.rows).toHaveLength(3)
    expect(tasks.more).toBe("Show all 4 tasks")
    expect(groups.find((g) => g.scope === "docs")!.more).toBeNull()
  })

  it("shows every row of one scope", () => {
    const groups = groupResults([task(1), task(2), task(3), task(4), doc], "tasks")
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(4)
    expect(groups[0].more).toBeNull()
  })

  it("sorts newest first by when each was made, and keeps the server's order for best match", () => {
    const rs = [task(1, 3), task(2, 9), task(3, 5)]
    expect(sortResults(rs, "best")).toBe(rs)
    expect(sortResults(rs, "newest").map((r) => r.task.task_id)).toEqual(["t2", "t3", "t1"])
  })
})

describe("when a result was made", () => {
  const r = (created_date: number) => ({ type: "message", message: { created_date } }) as unknown as Parameters<typeof resultTime>[0]
  it("reads seconds, milliseconds, microseconds and nanoseconds by their size", () => {
    expect(resultTime(r(1791614952000))).toBe(1791614952000)
    expect(resultTime(r(1791614952))).toBe(1791614952000)
    // The demo's index holds microseconds; nanoseconds read the same way.
    expect(resultTime(r(1791614952000000))).toBe(1791614952000)
    expect(resultTime(r(1791614952000000000))).toBe(1791614952000)
    expect(new Date(resultTime(r(1791614952000))).getUTCFullYear()).toBe(2026)
  })
})
