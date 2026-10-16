import { describe, expect, it } from "vitest"
import type { AttentionItem } from "@/services/memoryService"

// One project tile (12 Oct): a row of "What needs me now" drew Q4 launch in
// lake beside its dusk tile everywhere else. The AI's attention items name a
// project only by name (context), and the row keyed its tile on that name.

const { attentionToNeeds } = await import("@/components/ai/AttentionCard")

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
