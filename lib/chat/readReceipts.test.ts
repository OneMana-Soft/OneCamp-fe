import { describe, expect, it } from "vitest"
import { receiptsKey, receiptsKeyForEvent, seenLine, withSeen, type Receipts } from "@/lib/chat/readReceipts"

const sent = "2026-10-08T09:00:00.000Z"
const after = (min: number) => new Date(Date.parse(sent) + min * 60_000).toISOString()
const names: Record<string, string> = { maya: "Maya Chen", jonas: "Jonas Weber", sam: "Sam Rivera", lee: "Lee Park", ana: "Ana Ruiz" }
const nameOf = (u: string) => names[u] ?? "Someone"
const r = (...seen: [string, string][]): Receipts => ({ on: true, seen: seen.map(([user_uuid, seen_at]) => ({ user_uuid, seen_at })) })
const mine = { mine: true, createdAt: sent }

describe("the line under your latest message", () => {
  it("says Seen in a DM once the other person has read past it", () => {
    expect(seenLine(r(["maya", after(2)]), mine, { dm: true, others: 1, nameOf })?.text).toBe("Seen")
    expect(seenLine(r(["maya", after(-1)]), mine, { dm: true, others: 1, nameOf })).toBeNull()
    // The same moment isn't after it.
    expect(seenLine(r(["maya", sent]), mine, { dm: true, others: 1, nameOf })).toBeNull()
  })

  it("names who in a group, in the order they read it, and says everyone once all have", () => {
    const opts = { dm: false, others: 2, nameOf }
    expect(seenLine(r(["jonas", after(5)], ["maya", after(1)]), mine, opts)?.text).toBe("Seen by everyone")
    expect(seenLine(r(["jonas", after(5)]), mine, opts)?.text).toBe("Seen by Jonas Weber")
    const four = r(["maya", after(1)], ["jonas", after(2)], ["lee", after(3)], ["ana", after(4)])
    expect(seenLine(four, mine, { dm: false, others: 5, nameOf })?.text).toBe("Seen by Maya Chen, Jonas Weber and 2 others")
    const three = r(["maya", after(1)], ["jonas", after(2)], ["lee", after(3)])
    expect(seenLine(three, mine, { dm: false, others: 5, nameOf })?.text).toBe("Seen by Maya Chen, Jonas Weber and Lee Park")
    expect(seenLine(three, mine, { dm: false, others: 5, nameOf })?.title.split("\n")).toHaveLength(3)
  })

  it("shows nothing when receipts are off, or the latest message isn't yours", () => {
    expect(seenLine({ on: false, seen: [] }, mine, { dm: true, others: 1, nameOf })).toBeNull()
    expect(seenLine(r(["maya", after(2)]), { mine: false, createdAt: sent }, { dm: true, others: 1, nameOf })).toBeNull()
    expect(seenLine(r(["maya", after(2)]), undefined, { dm: true, others: 1, nameOf })).toBeNull()
  })
})

describe("a live receipt", () => {
  it("moves a mark forward, never back", () => {
    const was = r(["maya", after(5)])
    expect(withSeen(was, "maya", after(3))).toBe(was)
    expect(withSeen(was, "maya", after(9)).seen).toEqual([{ user_uuid: "maya", seen_at: after(9) }])
    expect(withSeen(was, "jonas", after(1)).seen).toHaveLength(2)
  })

  it("finds its conversation: a DM by the person who saw it, a group by its id", () => {
    expect(receiptsKeyForEvent("aaa bbb", "bbb")).toBe(receiptsKey({ kind: "dm", otherUUID: "bbb" }))
    expect(receiptsKeyForEvent("0123abcd", "bbb")).toBe(receiptsKey({ kind: "group", grpId: "0123abcd" }))
    expect(receiptsKey({ kind: "dm", otherUUID: "bbb" })).toBe("/dm/seen/bbb")
    expect(receiptsKey({ kind: "group", grpId: "g1" })).toBe("/groupChat/seen/g1")
  })
})
