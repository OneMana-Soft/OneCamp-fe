import { describe, expect, it } from "vitest"
import type { AttentionItem } from "@/services/memoryService"
import { pinTestClock } from "@/lib/testing/testClock"

// One project tile (12 Oct): a row of "What needs me now" drew Q4 launch in
// lake beside its dusk tile everywhere else. The AI's attention items name a
// project only by name (context), and the row keyed its tile on that name.

const { attentionToNeeds } = await import("@/components/ai/AttentionCard")

// Each test gives the time it reads by; the clock is pinned all the same (app/testClock).
pinTestClock()

const Q4 = "38275b11-237f-4218-b689-562b08fa14d8"
const item: AttentionItem = { source: "task", kind: "Due today", title: "Write the launch announcement", context: "Q4 launch", priority: 1, ref_id: "t1" }

describe("an attention row's project", () => {
  it("is keyed on the reader's project of that name, so its tile is the project's own", () => {
    const ids = new Map([["q4 launch", Q4]])
    const [row] = attentionToNeeds([item], new Date(2026, 9, 12, 9), (name) => ids.get(name.trim().toLowerCase()))
    expect(row.project).toEqual({ id: Q4, name: "Q4 launch" })
  }, 20_000)

  it("keeps the name when the reader has no project of that name", () => {
    expect(attentionToNeeds([item], new Date(2026, 9, 12, 9))[0].project).toEqual({ id: "Q4 launch", name: "Q4 launch" })
  })
})

// C11 (V-581): the server lists a commitment only while it needs its person
// now (commitmentNeedsMeNow: overdue for at most 14 days), as "Overdue
// commitment" with its date and its memory item. It was drawn as a task due
// ("1 task overdue") with a Done that went to the task list and failed.
describe("an overdue commitment", () => {
  const now = new Date(2026, 10, 6, 9)
  const commitment: AttentionItem = {
    source: "commitment",
    kind: "Overdue commitment",
    title: "Send the vendor shortlist to Priya",
    subtitle: "Was due 2026-11-02 · #launch",
    url: "/app/ai/memory?item=m-1",
    due_at: "2026-11-02",
    priority: 2,
  }

  it("is a commitment row: its date, its memory item, and no task", () => {
    const [row] = attentionToNeeds([commitment], now)
    expect(row).toMatchObject({ kind: "due", commitment: true, overdue: true, due: "Commitment · was due 2 Nov", href: "/app/ai/memory?item=m-1", refId: "m-1" })
    expect(row.taskUuid).toBeUndefined()
    expect(row.status).toBeUndefined()
  })

  it("is overdue only when the server says so, never by a date read here", () => {
    const [row] = attentionToNeeds([{ ...commitment, kind: "Commitment", due_time: "2026-11-02T09:00:00Z" }], now)
    expect(row.overdue).toBe(false)
  })
})
