import { describe, expect, it } from "vitest"
import { formatBytesShort, PURGEABLE, purgeLine } from "./purgeLine"

describe("purgeLine", () => {
  it("says nothing for types that only archive", () => {
    expect(purgeLine({ entity_type: "posts", purge_after_days: 30 })).toBe("")
  })

  it("names the two types that can be purged, and no more", () => {
    expect(PURGEABLE).toEqual(["attachments", "recordings"])
  })

  it("states the default plainly: archived items are kept", () => {
    expect(purgeLine({ entity_type: "attachments" })).toBe("Kept after archiving")
    expect(purgeLine({ entity_type: "recordings", purge_after_days: 0 })).toBe("Kept after archiving")
  })

  it("says when items go for good, and what has gone so far", () => {
    expect(purgeLine({ entity_type: "attachments", purge_after_days: 30 })).toBe("Removed for good 30 days after archiving")
    expect(purgeLine({ entity_type: "attachments", purge_after_days: 30, purged_count: 128, purged_bytes: 3.2 * 1024 ** 3 }))
      .toBe("Removed for good 30 days after archiving · 128 removed so far (3.2 GB)")
  })

  it("formats bytes for people", () => {
    expect(formatBytesShort(0)).toBe("0 B")
    expect(formatBytesShort(999)).toBe("999 B")
    expect(formatBytesShort(1536)).toBe("1.5 KB")
    expect(formatBytesShort(5 * 1024 ** 5)).toBe("5120.0 TB")
  })
})
