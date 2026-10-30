import { describe, expect, it } from "vitest"
import { blankForm, FIELD_TYPES, moveField, newFieldId, sentAnswer, typeLabel } from "./forms"

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
  it("names every kind the server asks, in the app's words", () => {
    expect(FIELD_TYPES.map((t) => t.value).sort()).toEqual(["checkbox", "date", "email", "file", "long_text", "multi_select", "number", "phone", "select", "short_text", "url"])
    expect(typeLabel("multi_select")).toBe("Several choices")
    expect(typeLabel("file")).toBe("Files")
    expect(typeLabel("url")).toBe("Link")
    expect(typeLabel("section")).toBe("Section")
  })
})

describe("a submission's answers", () => {
  it("read by question, and by label alone when sent before questions had ids", () => {
    expect(sentAnswer({ id: "what", label: "What?", value: "A logo" })).toEqual({ id: "what", label: "What?", value: "A logo" })
    expect(sentAnswer({ Label: "What?", Value: "A logo" })).toEqual({ id: "", label: "What?", value: "A logo" })
  })
})
