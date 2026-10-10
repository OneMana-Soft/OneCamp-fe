import { describe, expect, it } from "vitest"
import { firstUnreadKey } from "./unreadDivider"

// The "New" line goes above the oldest of the messages unread on opening:
// counting back that many messages, the reader's own not counted.

type M = { id: string; by: string }
const msgs = (spec: string): M[] => spec.split("").map((by, i) => ({ id: `m${i + 1}`, by }))
const key = (list: M[], n: number) => firstUnreadKey(list, n, (m) => m.by === "s", (m) => m.id)

describe("the first unread message", () => {
  it("is that many others' messages back from the end", () => {
    expect(key(msgs("mmjmj"), 2)).toBe("m4")
    expect(key(msgs("mmjmj"), 1)).toBe("m5")
  })

  it("skips the reader's own", () => {
    // m4 is Sam's (the reader's): two unread are m3 and m5.
    expect(key(msgs("mmjsj"), 2)).toBe("m3")
  })

  it("is none with nothing unread, or nothing above it to separate", () => {
    expect(key(msgs("mmj"), 0)).toBeNull()
    expect(key(msgs("mmj"), 3)).toBeNull()
    expect(key(msgs("mmj"), 9)).toBeNull()
    expect(key([], 2)).toBeNull()
  })
})
