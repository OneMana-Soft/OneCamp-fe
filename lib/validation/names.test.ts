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
})
