import { afterEach, describe, expect, it, vi } from "vitest"

import type { SearchResult } from "@/services/searchService"

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))

const { queryNotes, querySearch, querySearchRequest, scopeTotals, shownCounts, SCOPE_KINDS } = await import("@/lib/search/queryApi")

const task = (n: number) => ({ type: "task", task: { task_id: `t${n}` } }) as SearchResult
const doc = (n: number) => ({ type: "doc", doc: { doc_uuid: `d${n}` } }) as SearchResult

afterEach(() => post.mockReset())

describe("the search request", () => {
  it("asks for the chip's kinds, the order, the conversation and the reader's zone", () => {
    expect(querySearchRequest("launch", "all", "best", null)).toEqual({ q: "launch", zone: "Asia/Kolkata" })
    expect(querySearchRequest("launch", "docs", "newest", { kind: "channel", id: "c1" }, "cur")).toEqual({
      q: "launch",
      zone: "Asia/Kolkata",
      kinds: ["doc", "board"],
      sort: "newest",
      after: "cur",
      channel: "c1",
    })
    expect(querySearchRequest("x", "people", "oldest", { kind: "dm", id: "u2" })).toMatchObject({ kinds: ["person"], sort: "oldest", dm: "u2" })
  })

  it("posts to the grammar's endpoint, quietly, and reads its answer whole", async () => {
    post.mockResolvedValue({ data: { data: { page: [task(1)], totals: { task: 3 }, total: 3, has_more: true, next: "n1", query: { runs: true, issues: [], text: "launch" } } } })
    const a = await querySearch({ q: "launch" })
    expect(post).toHaveBeenCalledWith("/query/search", { q: "launch" }, { suppressErrorToast: true })
    expect(a).toMatchObject({ total: 3, has_more: true, next: "n1", notes: [], query: { runs: true, text: "launch" } })
    post.mockResolvedValue({ data: {} })
    expect(await querySearch({ q: "x" })).toMatchObject({ page: [], totals: {}, total: 0, has_more: false })
  })
})

describe("the counts a page shows (D-23)", () => {
  it("adds the server's kinds up into chips, All their sum", () => {
    expect(scopeTotals({ message: 4, doc: 2, board: 1, task: 3, team: 1, person: 0 })).toMatchObject({
      all: 11,
      messages: 4,
      docs: 3,
      tasks: 3,
      channels: 1,
      people: 0,
    })
    for (const kinds of Object.values(SCOPE_KINDS)) expect(kinds.length).toBeGreaterThan(0)
  })

  it("keeps the server's counts while there's more, and once every page is in counts the rows", () => {
    const server = scopeTotals({ task: 40, doc: 7 })
    expect(shownCounts(server, [task(1)], "all", true)).toBe(server)
    // The last page of everything: every chip is its rows.
    expect(shownCounts(server, [task(1), task(2), doc(1)], "all", false)).toMatchObject({ all: 3, tasks: 2, docs: 1 })
    // The last page of tasks: tasks are their rows, docs still the server's.
    expect(shownCounts(server, [task(1), task(2)], "tasks", false)).toMatchObject({ all: 9, tasks: 2, docs: 7 })
  })

  it("never says more rows than a complete listing shows", () => {
    const shown = shownCounts(scopeTotals({ task: 5 }), [task(1), task(2), task(3)], "tasks", false)
    expect(shown.tasks).toBe(3)
  })
})

describe("what the page says about the text", () => {
  it("says how a part was read and what couldn't be applied, once each", () => {
    const said = queryNotes({
      query: { runs: true, text: "", issues: [{ code: "unknown_value", span: [0, 9], level: "note", message: "Nothing called “#nowhere” that you can open, so it was searched as words." }] },
      notes: [
        { code: "unfiltered", span: [0, 0], level: "note", message: "Search can't filter by due: yet, so that part was left out." },
        { code: "unfiltered", span: [0, 0], level: "note", message: "Search can't filter by due: yet, so that part was left out." },
      ],
    })
    expect(said).toEqual([
      "Nothing called “#nowhere” that you can open, so it was searched as words.",
      "Search can't filter by due: yet, so that part was left out.",
    ])
    expect(queryNotes(undefined)).toEqual([])
  })
})
