import { describe, expect, it } from "vitest"
import { MAX_MATCHES, matchesIn, patternOf } from "@/lib/text/findPattern"

describe("a find's pattern, shared by a doc's Find and a board's", () => {
  it("is the query taken literally, case folded unless Match case, whole words by letters and digits in any script", () => {
    expect(patternOf("a.b(", { caseSensitive: false, wholeWord: false })!.test("xa.b(y")).toBe(true)
    expect(patternOf("", { caseSensitive: false, wholeWord: false })).toBeNull()
    expect("Ärger ärger".match(patternOf("ärger", { caseSensitive: true, wholeWord: false })!)).toEqual(["ärger"])
    const whole = patternOf("plan", { caseSensitive: false, wholeWord: true })!
    expect("plan, planning, Plan_b, déplan PLAN".match(whole)).toEqual(["plan", "PLAN"])
  })
})

describe("the matches in a text", () => {
  it("are every match in order, where it starts and how long it is", () => {
    const re = patternOf("ab", { caseSensitive: false, wholeWord: false })!
    expect(matchesIn("ab xAB ab", re)).toEqual([
      { index: 0, length: 2 },
      { index: 4, length: 2 },
      { index: 7, length: 2 },
    ])
    // The pattern is used again from the start each time.
    expect(matchesIn("ab", re)).toEqual([{ index: 0, length: 2 }])
  })

  it("stop at the limit given, and never loop on an empty match", () => {
    const re = patternOf("a", { caseSensitive: false, wholeWord: false })!
    expect(matchesIn("aaaa", re, 3)).toHaveLength(3)
    expect(matchesIn("abc", /x*/gu)).toEqual([])
    expect(MAX_MATCHES).toBe(5000)
  })
})
