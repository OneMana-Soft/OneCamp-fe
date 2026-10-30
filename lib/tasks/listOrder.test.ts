import { describe, expect, it } from "vitest"

import {
  MANUAL_SORT,
  chainMoves,
  dropPlace,
  effectiveRank,
  isManualSort,
  ranksBetween,
  requestSorting,
  placeTasks,
  sortByRank,
  stepPlace,
  undoRuns,
  withRanks,
  type Ranked,
} from "@/lib/tasks/listOrder"
import { pinTestClock } from "@/lib/testing/testClock"

// The dates here are tasks' creation times, never read against today; the clock is pinned all the same.
pinTestClock()

const t = (id: string, extra: Partial<Ranked> = {}): Ranked => ({ task_uuid: id, task_created_at: "2026-10-01T09:00:00Z", ...extra })
const ids = (ts: Ranked[]) => ts.map((x) => x.task_uuid)

describe("the list's manual order is the project's one order (L-1)", () => {
  it("is the list's sort when none is chosen: the request asks for task_rank", () => {
    expect(requestSorting([])).toEqual([MANUAL_SORT])
    expect(MANUAL_SORT).toEqual({ id: "task_rank", desc: false })
    expect(requestSorting([{ id: "task_due_date", desc: true }])).toEqual([{ id: "task_due_date", desc: true }])
    expect(isManualSort([])).toBe(true)
    expect(isManualSort([{ id: "task_rank", desc: false }])).toBe(true)
    expect(isManualSort([{ id: "task_created_at", desc: false }])).toBe(false)
  })

  it("ranks a never-moved task by minus its creation time in ms, so the newest come first, before ranked ones near 0", () => {
    const older = t("old", { task_created_at: "2026-10-01T09:00:00Z" })
    const newer = t("new", { task_created_at: "2026-10-02T09:00:00Z" })
    expect(effectiveRank(older)).toBe(-Date.parse("2026-10-01T09:00:00Z"))
    expect(ids(sortByRank([t("r", { task_rank: 0 }), older, newer]))).toEqual(["new", "old", "r"])
  })

  it("orders as the server does: rank, then newest, then id", () => {
    const a = t("a", { task_rank: 5, task_created_at: "2026-10-01T09:00:00Z" })
    const b = t("b", { task_rank: 5, task_created_at: "2026-10-02T09:00:00Z" })
    const c = t("c", { task_rank: 5, task_created_at: "2026-10-02T09:00:00Z" })
    expect(ids(sortByRank([c, a, b]))).toEqual(["b", "c", "a"])
  })

  it("keeps the same array when the order is already right, so nothing renders again", () => {
    const list = [t("a", { task_rank: 1 }), t("b", { task_rank: 2 })]
    expect(sortByRank(list)).toBe(list)
  })

  it("re-sorts in place from a message's ranks, leaving the other tasks' objects alone", () => {
    const list = [t("a", { task_rank: 1024 }), t("b", { task_rank: 2048 }), t("c", { task_rank: 3072 })]
    const next = withRanks(list, { c: 1536 })
    expect(ids(next)).toEqual(["a", "c", "b"])
    expect(next[0]).toBe(list[0])
    expect(next.find((x) => x.task_uuid === "c")?.task_rank).toBe(1536)
    expect(withRanks(list, { zz: 1 })).toBe(list)
  })

  it("moves only the tasks a message names: a list whose order its ranks don't explain keeps every other row where it is", () => {
    // Never moved, created in no order the list follows: a full re-sort would reshuffle them all.
    const list = [t("a", { task_created_at: "2026-10-01T09:00:00Z" }), t("b", { task_created_at: "2026-10-05T09:00:00Z" }), t("c", { task_created_at: "2026-10-03T09:00:00Z" }), t("d", { task_rank: 10 })]
    const next = withRanks(list, { d: -Date.parse("2026-10-04T09:00:00Z") })
    expect(next).toHaveLength(4)
    expect(ids(next).filter((id) => id !== "d")).toEqual(["a", "b", "c"])
    // In front of the first task that sorts after it (a, older).
    expect(ids(next)).toEqual(["d", "a", "b", "c"])
  })

  it("spaces new ranks as the server does (business/TaskRank BetweenMany)", () => {
    expect(ranksBetween(null, null, 2)).toEqual([0, 1024])
    expect(ranksBetween(null, 100, 2)).toEqual([100 - 2048, 100 - 1024])
    expect(ranksBetween(100, null, 2)).toEqual([1124, 2148])
    expect(ranksBetween(0, 300, 2)).toEqual([100, 200])
  })
})

describe("where a drop lands: the tasks directly above and below in the project's order", () => {
  // The project's order, and the status groups the list shows it in.
  const flat = ["t1", "p1", "t2", "p2", "t3", "d1"]
  const todo = ["t1", "t2", "t3"]
  const doing = ["p1", "p2"]

  it("between two rows of a group: those two", () => {
    expect(dropPlace({ flat, group: todo, index: 1, moving: ["t3"] })).toEqual({ before: "t1", after: "t2" })
  })

  it("at a group's top: its first task below, and above it whatever comes before that in the project", () => {
    expect(dropPlace({ flat, group: doing, index: 0, moving: ["t3"] })).toEqual({ before: "t1", after: "p1" })
    expect(dropPlace({ flat, group: todo, index: 0, moving: ["t2"] })).toEqual({ before: "", after: "t1" })
  })

  it("at a group's foot: its last task above, and below it whatever comes after that in the project", () => {
    expect(dropPlace({ flat, group: doing, index: 2, moving: ["t1"] })).toEqual({ before: "p2", after: "t3" })
    expect(dropPlace({ flat, group: todo, index: 2, moving: ["t1"] })).toEqual({ before: "t3", after: "d1" })
    expect(dropPlace({ flat: ["a", "b"], group: ["a", "b"], index: 2, moving: [] })).toEqual({ before: "b", after: "" })
  })

  it("with a selection: the moved tasks are never their own neighbours", () => {
    // t1 and t2 dragged below t3: t3 above, d1 below (t2 was between).
    expect(dropPlace({ flat, group: todo, index: 1, moving: ["t1", "t2"] })).toEqual({ before: "t3", after: "d1" })
    // Dropped at doing's foot, the selection's own t3 is skipped going down.
    expect(dropPlace({ flat, group: doing, index: 2, moving: ["t2", "t3"] })).toEqual({ before: "p2", after: "d1" })
  })

  it("into an empty group: nothing either side", () => {
    expect(dropPlace({ flat, group: [], index: 0, moving: ["t1"] })).toEqual({ before: "", after: "" })
  })
})

describe("a drop on screen, before the server answers", () => {
  const list = ["a", "b", "c", "d", "e"].map((id) => t(id))

  it("puts the moved tasks right after the task above the drop, in their order, and moves nothing else", () => {
    expect(ids(placeTasks(list, { ids: ["a", "c"], before: "d", after: "e" }, { a: 5, c: 6 }))).toEqual(["b", "d", "a", "c", "e"])
    expect(placeTasks(list, { ids: ["a"], before: "d", after: "e" }, { a: 5 }).find((x) => x.task_uuid === "a")?.task_rank).toBe(5)
  })

  it("at the top, right before the task below the drop", () => {
    expect(ids(placeTasks(list, { ids: ["d"], before: "", after: "a" }, {}))).toEqual(["d", "a", "b", "c", "e"])
  })

  it("leaves a page that holds neither neighbour as it is, its tasks changed in place", () => {
    const page = [t("x"), t("a"), t("y")]
    const next = placeTasks(page, { ids: ["a"], before: "q", after: "r" }, { a: 7 })
    expect(ids(next)).toEqual(["x", "a", "y"])
    expect(next[1].task_rank).toBe(7)
  })

  it("is the same list when nothing in it moves", () => {
    expect(placeTasks(list, { ids: ["z"], before: "a", after: "b" }, { z: 1 })).toBe(list)
  })
})

describe("moving several tasks, one request after another until the bulk writer lands", () => {
  it("chains: the first between the drop's neighbours, each next right after the one before it", () => {
    expect(chainMoves(["a", "b", "c"], "x", "y")).toEqual([
      { task_uuid: "a", before: "x", after: "y" },
      { task_uuid: "b", before: "a", after: "y" },
      { task_uuid: "c", before: "b", after: "y" },
    ])
  })

  it("carries a status for the tasks that change group", () => {
    expect(chainMoves(["a", "b"], "", "y", { b: "done" })).toEqual([
      { task_uuid: "a", before: "", after: "y" },
      { task_uuid: "b", before: "a", after: "y", status: "done" },
    ])
  })
})

describe("Alt+↑ and Alt+↓: one place in the group", () => {
  const flat = ["a", "b", "c", "d"]
  it("moves a task one place up or down among the others", () => {
    expect(stepPlace({ group: flat, moving: ["c"], by: -1 })).toBe(1)
    expect(stepPlace({ group: flat, moving: ["c"], by: 1 })).toBe(3)
    expect(dropPlace({ flat, group: flat, index: 1, moving: ["c"] })).toEqual({ before: "a", after: "b" })
  })

  it("stops at either end", () => {
    expect(stepPlace({ group: flat, moving: ["a"], by: -1 })).toBeNull()
    expect(stepPlace({ group: flat, moving: ["d"], by: 1 })).toBeNull()
  })

  it("moves a selection as one block, closing the gaps between its tasks", () => {
    expect(stepPlace({ group: flat, moving: ["b", "d"], by: -1 })).toBe(0)
    expect(stepPlace({ group: flat, moving: ["a", "c"], by: 1 })).toBe(2)
  })
})

describe("undo: each run of moved tasks goes back between its old neighbours", () => {
  it("one task", () => {
    expect(undoRuns(["a", "b", "c"], ["b"], { b: "todo" })).toEqual([{ ids: ["b"], before: "a", after: "c", status: { b: "todo" } }])
  })

  it("a selection from two places goes back to both", () => {
    expect(undoRuns(["a", "x", "b", "y", "z", "c"], ["x", "y", "z"])).toEqual([
      { ids: ["x"], before: "a", after: "b", status: {} },
      { ids: ["y", "z"], before: "b", after: "c", status: {} },
    ])
  })

  it("at the ends", () => {
    expect(undoRuns(["x", "a", "y"], ["x", "y"])).toEqual([
      { ids: ["x"], before: "", after: "a", status: {} },
      { ids: ["y"], before: "a", after: "", status: {} },
    ])
  })
})
