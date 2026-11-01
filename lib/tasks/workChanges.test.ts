import { describe, expect, it, vi } from "vitest"

import { applyEntries, createWorkFeed, readerOver, signalOfMessage, type HttpGet, type TaskPatchers, type WorkEntry, type WorkFeedDeps } from "@/lib/tasks/workChanges"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const P = "11111111-1111-4111-8111-111111111111"
const Q = "22222222-2222-4222-8222-222222222222"
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

const entry = (sequence: number, kind: string, task: string, diff: Record<string, unknown> | null = null, project = P): WorkEntry => ({
  sequence, kind, resource_kind: "task", resource_uuid: task, project_uuid: project, diff, actor: "u-bea",
})

/** Patchers that write down what each was asked, in order. */
function recorder() {
  const calls: unknown[][] = []
  const to: TaskPatchers = {
    updateTasks: (patches, project) => calls.push(["update", patches, project]),
    moveTask: (patch, project) => calls.push(["move", patch, project]),
    setTaskField: (task, project, field, value) => calls.push(["field", task, project, field, value]),
    deleteTask: (task, project) => calls.push(["delete", task, project]),
    rereadProject: (project) => calls.push(["reread", project]),
  }
  return { calls, to }
}

describe("a Task_Changed message, read for the open views", () => {
  it("is an entry when it carries one: its number, kind, task, project, diff and who made it", () => {
    const s = signalOfMessage({ task_uuid: T1, project_uuid: P, sequence: 41, kind: "task.updated", diff: { task_name: "Ship it" }, by: "u-bea" })
    expect(s).toEqual({ entry: { sequence: 41, kind: "task.updated", resource_kind: "task", resource_uuid: T1, project_uuid: P, diff: { task_name: "Ship it" }, actor: "u-bea" } })
  })

  it("is the project's re-read when it names nothing (a task only a few may see, or a burst)", () => {
    expect(signalOfMessage({ project_uuid: P, reread: true })).toEqual({ reread: P })
  })

  it("is nothing of the feed's for a move's new ranks, or for what isn't a message", () => {
    expect(signalOfMessage({ project_uuid: P, ranks: { [T1]: 3 } })).toBeNull()
    expect(signalOfMessage({ task_uuid: T1, sequence: 4, kind: "task.updated" })).toBeNull()
    expect(signalOfMessage("nope")).toBeNull()
    expect(signalOfMessage(null)).toBeNull()
  })
})

describe("entries, through the patchers every open list, board and timeline already uses", () => {
  it("moves a task whose status changed, with every field of the change", () => {
    const { calls, to } = recorder()
    applyEntries([entry(5, "task.updated", T1, { task_status: "done", task_status_since: "2026-10-31T06:00:00Z" })], to)
    expect(calls).toEqual([["move", { task_uuid: T1, task_status: "done", task_status_since: "2026-10-31T06:00:00Z" }, P]])
  })

  it("changes names and assignees in place, once per project for the lot, the later value winning", () => {
    const { calls, to } = recorder()
    const sam = { uuid: "u-sam", user_name: "sam", user_full_name: "Sam Lee" }
    applyEntries([
      entry(5, "task.updated", T1, { task_name: "Draft" }),
      entry(6, "task.updated", T2, { task_assignee: sam }),
      entry(7, "task.updated", T1, { task_name: "Final" }),
      entry(8, "task.updated", T1, { task_priority: "high" }, Q),
    ], to)
    expect(calls).toEqual([
      ["update", [{ task_uuid: T1, task_name: "Final" }, { task_uuid: T2, task_assignee: sam }], P],
      ["update", [{ task_uuid: T1, task_priority: "high" }], Q],
    ])
  })

  it("sets one of the project's own fields, and takes one off with null", () => {
    const { calls, to } = recorder()
    applyEntries([
      entry(5, "task.updated", T1, { field_id: "f-size", value: "opt-l" }),
      entry(6, "task.updated", T1, { field_id: "f-size" }),
    ], to)
    expect(calls).toEqual([["field", T1, P, "f-size", "opt-l"], ["field", T1, P, "f-size", null]])
  })

  it("takes a deleted task away, and reads a project again once for what was made or restored", () => {
    const { calls, to } = recorder()
    applyEntries([
      entry(5, "task.created", T1, { task_name: "New" }),
      entry(6, "task.restored", T2, { task_name: "Back" }),
      entry(7, "task.deleted", T1),
    ], to)
    expect(calls).toEqual([["reread", P], ["delete", T1, P]])
  })

  it("keeps the log's order: changes waiting for their batch go before a move, a field or a delete of that project", () => {
    const { calls, to } = recorder()
    applyEntries([
      entry(5, "task.updated", T1, { task_name: "Before the move" }),
      entry(6, "task.updated", T1, { task_status: "in_progress" }),
      entry(7, "task.updated", T2, { task_name: "After" }),
      entry(8, "task.deleted", T2),
    ], to)
    expect(calls).toEqual([
      ["update", [{ task_uuid: T1, task_name: "Before the move" }], P],
      ["move", { task_uuid: T1, task_status: "in_progress" }, P],
      ["update", [{ task_uuid: T2, task_name: "After" }], P],
      ["delete", T2, P],
    ])
  })

  it("reads a project again for a kind it doesn't know, and skips what names no project or no change", () => {
    const { calls, to } = recorder()
    applyEntries([
      entry(5, "task.archived", T1, { task_name: "x" }),
      { sequence: 6, kind: "task.updated", resource_uuid: T1, diff: { task_name: "no project" } },
      entry(7, "task.updated", T2, null),
      entry(8, "task.updated", T2, {}),
    ], to)
    expect(calls).toEqual([["reread", P]])
  })
})

/** A server's log of entries 1..n, read by place, with what the feed kept and did. */
function server(n: number, opts: { oldest?: number } = {}) {
  const log = Array.from({ length: n }, (_, i) => entry(i + 1, "task.updated", T1, { task_name: `v${i + 1}` }))
  const reads: string[] = []
  let kept: string | undefined
  const applied: number[] = []
  const deps: WorkFeedDeps = {
    read: vi.fn(async (cursor: string, limit: number) => {
      reads.push(cursor)
      if (cursor === "") return { entries: [], cursor: String(log.length) }
      const after = Number(cursor)
      if (opts.oldest !== undefined && after < opts.oldest - 1) return "gone" as const
      const entries = log.filter((e) => e.sequence > after).slice(0, limit)
      return { entries, cursor: String(entries.length ? entries[entries.length - 1].sequence : after) }
    }),
    loadCursor: vi.fn(async () => kept),
    saveCursor: vi.fn(async (c: string) => { kept = c }),
    apply: vi.fn((es: WorkEntry[]) => { for (const e of es) applied.push(e.sequence) }),
    rereadAll: vi.fn(),
  }
  return { log, reads, deps, applied, keep: (c: string | undefined) => { kept = c }, kept: () => kept }
}

describe("catching up through GET /work/changes", () => {
  it("starts at the log's head on a device that kept no place, and changes nothing", async () => {
    const s = server(7)
    await createWorkFeed(s.deps).catchUp()
    expect(s.reads).toEqual([""])
    expect(s.kept()).toBe("7")
    expect(s.applied).toEqual([])
    expect(s.deps.rereadAll).not.toHaveBeenCalled()
  })

  it("applies what came after the kept place, page by page in order, and keeps each page's place", async () => {
    const s = server(12)
    s.keep("3")
    await createWorkFeed(s.deps, { limit: 4 }).catchUp()
    expect(s.reads).toEqual(["3", "7", "11"])
    expect(s.applied).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(s.kept()).toBe("12")
    expect(s.deps.rereadAll).not.toHaveBeenCalled()
  })

  it("reads every list again from the head when its place is gone (410)", async () => {
    const s = server(30, { oldest: 20 })
    s.keep("5")
    await createWorkFeed(s.deps).catchUp()
    expect(s.reads).toEqual(["5", ""])
    expect(s.kept()).toBe("30")
    expect(s.applied).toEqual([])
    expect(s.deps.rereadAll).toHaveBeenCalledTimes(1)
  })

  it("reads every list again rather than patch past its page budget", async () => {
    const s = server(50)
    s.keep("0")
    await createWorkFeed(s.deps, { limit: 5, maxPages: 2 }).catchUp()
    expect(s.reads).toEqual(["0", "5", ""])
    expect(s.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(s.kept()).toBe("50")
    expect(s.deps.rereadAll).toHaveBeenCalledTimes(1)
  })

  it("applies a live entry at once, and holds one that comes while it catches up until the pages are in", async () => {
    const s = server(6)
    s.keep("2")
    const feed = createWorkFeed(s.deps)
    feed.live(entry(7, "task.updated", T1, { task_name: "live first" }))
    expect(s.applied).toEqual([7])
    s.applied.length = 0
    const done = feed.catchUp()
    feed.live(entry(5, "task.updated", T1)) // also in a page: applied once, in its place
    feed.live(entry(8, "task.updated", T1)) // newer than every page: after them
    expect(s.applied).toEqual([])
    await done
    expect(s.applied).toEqual([3, 4, 5, 6, 8])
  })

  it("keeps its place when a read fails, lets held entries through, and goes on from that place next time", async () => {
    const s = server(6)
    s.keep("2")
    const feed = createWorkFeed(s.deps)
    ;(s.deps.read as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"))
    const done = feed.catchUp()
    feed.live(entry(9, "task.updated", T1))
    await done
    expect(s.kept()).toBe("2")
    expect(s.applied).toEqual([9])
    await feed.catchUp()
    expect(s.applied).toEqual([9, 3, 4, 5, 6])
    expect(s.kept()).toBe("6")
  })

  it("runs one catch-up at a time, and once more after it when asked again meanwhile", async () => {
    const s = server(4)
    s.keep("0")
    const feed = createWorkFeed(s.deps)
    const a = feed.catchUp()
    const b = feed.catchUp()
    const c = feed.catchUp()
    await Promise.all([a, b, c])
    expect(s.reads).toEqual(["0", "4"])
    expect(s.applied).toEqual([1, 2, 3, 4])
  })
})

describe("the log's read, over the app's HTTP client", () => {
  it("asks GET /work/changes quietly for the page after a place, and answers its entries and new place", async () => {
    const entries: WorkEntry[] = [{ sequence: 42, kind: "task.updated", resource_uuid: "t1", project_uuid: "p1", diff: { task_name: "Ship" } }]
    const get = vi.fn<HttpGet>().mockResolvedValue({ data: { msg: "ok", data: { entries, cursor: "42" } } })
    await expect(readerOver(get)("41", 500)).resolves.toEqual({ entries, cursor: "42" })
    expect(get).toHaveBeenCalledWith("/work/changes", { params: { cursor: "41", limit: 500 }, silent: true, suppressErrorToast: true })
  })

  it("keeps the place it asked from when an answer names none, and takes no entries from a malformed one", async () => {
    const get = vi.fn<HttpGet>().mockResolvedValue({ data: { data: { entries: "none" } } })
    await expect(readerOver(get)("41", 500)).resolves.toEqual({ entries: [], cursor: "41" })
  })

  it("answers gone for a place the log no longer has (410), and lets any other failure through", async () => {
    await expect(readerOver(vi.fn<HttpGet>().mockRejectedValue({ response: { status: 410 } }))("7", 500)).resolves.toBe("gone")
    const down = new Error("Network Error")
    await expect(readerOver(vi.fn<HttpGet>().mockRejectedValue(down))("7", 500)).rejects.toBe(down)
  })
})
