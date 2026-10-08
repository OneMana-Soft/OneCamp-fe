import { describe, expect, it } from "vitest"
import { partialNote } from "@/lib/tables/chartNote"

const bucket = { label: "Live", value: 3, count: 3 }

describe("the note under a table's chart", () => {
  it("says nothing when the chart is whole", () => {
    expect(partialNote({ truncated: false, buckets: [bucket], distinct_groups: 1 })).toBeNull()
  })

  it("says how many groups are shown when the rest are left out", () => {
    expect(partialNote({ truncated: true, buckets: [bucket, bucket], distinct_groups: 9 })).toBe("Showing the top 2 of 9 groups.")
  })

  // Every group shows, so the rows are what's short: more than the server
  // reads, or formulas it couldn't work out.
  it("says some rows aren't counted otherwise", () => {
    expect(partialNote({ truncated: true, buckets: [bucket], distinct_groups: 1 })).toMatch(/^Some rows aren't counted/)
  })
})
