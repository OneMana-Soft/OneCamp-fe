import { describe, expect, it } from "vitest"
import { handleProblem, isValidName, nameProblem, nameSchema, normalizeHandle } from "./names"

describe("names", () => {
  it.each(["qa", "launch-week", "Q4 launch", "design_ops", "विपणन", "製品"])("accepts the workspace name %s", (v) =>
    expect(isValidName("workspace", v)).toBe(true))
  it.each(["a", "x".repeat(41), "launch/week", "<b>", "  "])("refuses the workspace name %s", (v) =>
    expect(isValidName("workspace", v)).toBe(false))
  it.each(["Li", "José Álvarez", "O'Brien", "Mary-Jane", "Dr. Smith", "अकाश"])("accepts the person %s", (v) =>
    expect(isValidName("person", v)).toBe(true))
  it.each(["What's next?", "Q4: plan (draft)", "Launch notes — 5 Oct"])("accepts the title %s", (v) =>
    expect(isValidName("title", v)).toBe(true))
  it("refuses control characters in titles", () => expect(isValidName("title", "a\u0007b")).toBe(false))
  it("explains a refusal", () => {
    const r = nameSchema("workspace", "Channel name").safeParse("a/b")
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].message).toMatch(/Channel name can use letters/)
  })
  it("says what is wrong with a name, or nothing", () => {
    expect(nameProblem("person", "Your name", "José O'Brien")).toBe("")
    expect(nameProblem("person", "Your name", "")).toBe("Your name can't be empty")
    expect(nameProblem("person", "Your name", "a<b")).toMatch(/^Your name can use letters/)
  })
  it("keeps a handle one way, and checks it by its own rule", () => {
    expect(normalizeHandle("  @Sam.Smith ")).toBe("sam.smith")
    for (const ok of ["sam", "sam-2", "priya.raman", "jo_ann", "josé-obrien", "李雷"]) expect(handleProblem(ok)).toBe("")
    for (const bad of ["s", "-sam", "sam smith", "sam@x", "a".repeat(31)]) expect(handleProblem(bad)).toMatch(/^A handle can use/)
  })

  // As the server has it (helpers.IsValidPersonName): a name has a letter or a
  // number, and nothing that can't be seen, so two names that look the same
  // can't differ invisibly; it's compared in NFC.
  it("refuses a name that is all punctuation, or hides a character", () => {
    expect(isValidName("person", "Jose\u0301")).toBe(true)
    expect(isValidName("person", "Nguye\u0302\u0303n")).toBe(true)
    for (const bad of ["...", "- . '", "Ana\u200b", "Ana\ufe0f", "\u0301Ana", "Ana \u0301"]) {
      expect(isValidName("person", bad)).toBe(false)
    }
    expect(nameProblem("person", "Your name", "...")).toBe("Your name needs at least one letter or number")
    expect(nameProblem("person", "Your name", "Ana\ufe0f")).toMatch(/^Your name has a character that can't be seen/)
  })

  // @everyone, @here, @channel, @all and @admin mean groups in a mention.
  it("keeps reserved words and unseen characters out of handles", () => {
    for (const word of ["everyone", "here", "channel", "all", "admin"]) {
      expect(handleProblem(word)).toBe(`@${word} means a group of people in a mention, so it can't be anyone's handle. Try another.`)
    }
    expect(handleProblem("admin-2")).toBe("")
    expect(handleProblem("ana\u200bbo")).toMatch(/^A handle can use/)
    expect(normalizeHandle(" @Jose\u0301 ")).toBe("jos\u00e9")
  })
})
