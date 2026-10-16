import { afterEach, describe, expect, it } from "vitest"
import { countMention, mentionCounts } from "./mentionedOften"

afterEach(() => localStorage.clear())

describe("who this person mentions most", () => {
  it("counts each mention", () => {
    countMention("u-maya")
    countMention("u-maya")
    countMention("u-sam")
    expect(Object.fromEntries(mentionCounts())).toEqual({ "u-maya": 2, "u-sam": 1 })
  })

  it("keeps the 50 people mentioned most recently, so someone new always gets a place", () => {
    for (let i = 0; i < 50; i++) {
      countMention(`u-${i}`)
      countMention(`u-${i}`)
    }
    countMention("u-new")
    const counts = mentionCounts()
    expect(counts.size).toBe(50)
    expect(counts.get("u-new")).toBe(1)
    expect(counts.has("u-0")).toBe(false)
  })

  it("counts nothing from a store it can't read", () => {
    localStorage.setItem("onecamp-mentioned-often", "[not json")
    expect(mentionCounts().size).toBe(0)
    countMention("u-maya")
    expect(Object.fromEntries(mentionCounts())).toEqual({ "u-maya": 1 })
  })
})
