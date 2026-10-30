import { describe, expect, it } from "vitest"
import { callAt, contextAt, matchingBracket } from "./formulaAssist"

// The caret is where | is.
const at = (s: string) => ({ text: s.replace("|", ""), caret: s.indexOf("|") })

describe("what the formula editor offers at the caret (B2)", () => {
  it("a field inside braces, by what's typed so far", () => {
    const { text, caret } = at("{Price} * {Qua|")
    expect(contextAt(text, caret)).toEqual({ kind: "field", partial: "Qua", start: 10 })
  })

  it("a linked table's field after {Link}.", () => {
    const { text, caret } = at("ARRAYJOIN({Vendor}.{Ci|")
    expect(contextAt(text, caret)).toEqual({ kind: "linked", link: "Vendor", partial: "Ci", start: 19 })
  })

  it("a function as its name is typed, and nothing inside text or a comment", () => {
    const f = at("ROUND({Price}, 2) + arr|")
    expect(contextAt(f.text, f.caret)).toEqual({ kind: "function", partial: "arr", start: 20 })
    const s = at('"arr|')
    expect(contextAt(s.text, s.caret)).toBeNull()
    const c = at("/* arr| */")
    expect(contextAt(c.text, c.caret)).toBeNull()
    const n = at("12|")
    expect(contextAt(n.text, n.caret)).toBeNull()
  })

  it("says which function the caret is in and on which value, past text and fields with commas in them", () => {
    const a = at('IF({Done, really}, "a, b", |')
    expect(callAt(a.text, a.caret)).toEqual({ name: "IF", arg: 2 })
    const b = at("ROUND(SUM({A}, {B}|), 2)")
    expect(callAt(b.text, b.caret)).toEqual({ name: "SUM", arg: 1 })
    const c = at("(1 + |2)")
    expect(callAt(c.text, c.caret)).toBeNull()
  })

  it("pairs a bracket at the caret with its other half, past brackets in text", () => {
    const a = at('IF(LEN("(") > |1, 2)')
    expect(matchingBracket(a.text, a.caret)).toBeNull()
    const before = at('IF(LEN("(") > 1, 2|)')
    expect(matchingBracket(before.text, before.caret)).toEqual([2, 18])
    const b = at('IF(LEN("(") > 1, 2)|')
    expect(matchingBracket(b.text, b.caret)).toEqual([2, 18])
    const c = at("ROUND(|SUM(1), 2)")
    expect(matchingBracket(c.text, c.caret)).toEqual([5, 15])
  })
})
