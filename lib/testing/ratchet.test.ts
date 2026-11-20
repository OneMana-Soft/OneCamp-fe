import { describe, expect, it } from "vitest"

import { compare, nextBaseline, tally, type Counts } from "@/lib/testing/ratchet"

describe("a guard's per-file ratchet", () => {
  const base = { keys: ["Boards", "Recordings"], files: { "a.tsx": { Boards: 2 }, "b.tsx": { Recordings: 1 } } }

  it("fails a file over its baseline and a baseline over today's count", () => {
    const now: Counts = { "a.tsx": { Boards: 3 }, "c.tsx": { Recordings: 1 } }
    const { over, stale } = compare(base, now, base.keys)
    expect(over).toEqual([
      { file: "a.tsx", key: "Boards", n: 3, allowed: 2 },
      { file: "c.tsx", key: "Recordings", n: 1, allowed: 0 },
    ])
    expect(stale).toEqual(["b.tsx: Recordings 0 < 1"])
    expect(compare(base, base.files, [...base.keys, "Check-ins"]).stale).toEqual(["new key Check-ins"])
  })

  it("rewrites a known key only downwards and takes in a new key's uses once", () => {
    const now: Counts = {}
    tally(now, "a.tsx", "Boards", 5)
    tally(now, "a.tsx", "Check-ins")
    tally(now, "d.tsx", "Recordings")
    expect(nextBaseline(base, now, ["Boards", "Check-ins", "Recordings"])).toEqual({
      keys: ["Boards", "Check-ins", "Recordings"],
      files: { "a.tsx": { Boards: 2, "Check-ins": 1 } },
    })
  })
})
