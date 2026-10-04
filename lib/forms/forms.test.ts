import { describe, expect, it } from "vitest"
import { blankForm, moveField, newFieldId } from "./forms"

describe("form helpers", () => {
  it("gives new questions unused ids", () => {
    const f = blankForm().fields
    expect(newFieldId(f)).toBe("q4")
    expect(newFieldId([{ id: "q2", label: "a", type: "short_text", required: false }])).toBe("q3")
  })
  it("moves questions within bounds", () => {
    const f = blankForm().fields
    expect(moveField(f, 0, 1).map((x) => x.id)).toEqual(["q2", "q1", "q3"])
    expect(moveField(f, 0, -1)).toBe(f)
  })
})
