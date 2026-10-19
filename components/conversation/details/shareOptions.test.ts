import { describe, expect, it } from "vitest"
import { shareOptions } from "@/components/conversation/details/shareOptions"
import type { ShareChoice } from "@/lib/conversation/conversationApi"

const choice = (share: ShareChoice["share"], messages: number, replies: number, cap = 5000): ShareChoice => ({
  share, messages, replies, shared: Math.min(messages + replies, cap), capped: messages + replies > cap, cap,
})

describe("Share earlier messages?", () => {
  it("starts fresh first, then the last day, the last 7 days and everything, each counted", () => {
    const options = shareOptions([choice("none", 0, 0), choice("day", 1, 0), choice("week", 12, 3), choice("all", 40, 1)])
    expect(options.map((o) => [o.share, o.label, o.description])).toEqual([
      ["none", "No, start fresh", "They see what's said from now on. Earlier messages stay here."],
      ["day", "The last day", "1 message"],
      ["week", "The last 7 days", "12 messages and 3 replies"],
      ["all", "Everything", "40 messages and 1 reply"],
    ])
  })

  it("says everything over the cap shares the newest that fit", () => {
    const all = shareOptions([choice("all", 6000, 240)]).find((o) => o.share === "all")
    expect(all?.description).toBe("The last 5,000 of 6,240 messages and replies")
    expect(all?.empty).toBe(false)
  })

  it("says when a choice has nothing in it, and keeps it from being picked", () => {
    const day = shareOptions([choice("day", 0, 0)]).find((o) => o.share === "day")
    expect(day).toMatchObject({ description: "Nothing in that time", empty: true })
    expect(shareOptions([choice("all", 0, 0)]).find((o) => o.share === "all")?.description).toBe("Nothing to share yet")
  })

  it("offers every choice while the counts load, without words it can't know", () => {
    const options = shareOptions(undefined)
    expect(options.map((o) => o.share)).toEqual(["none", "day", "week", "all"])
    expect(options.slice(1).every((o) => o.description === "" && !o.empty)).toBe(true)
  })
})
