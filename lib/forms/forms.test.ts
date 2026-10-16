import { describe, expect, it } from "vitest"
import { blankForm, moveField, newFieldId, numberProblem, type FormField } from "./forms"

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

// A number answer is read as its sender writes numbers: "1,5" from Berlin is
// one and a half; in en-US's signs it isn't a number at all (a comma groups
// digits there), and is said so before anything is sent.
describe("number answers in the sender's signs", () => {
  const fields: FormField[] = [{ id: "seats", label: "Seats", type: "number", required: false } as FormField]
  it("takes a number as a German visitor writes it", () => {
    expect(numberProblem(fields, { seats: "1,5" }, "de-DE")).toBe("")
    expect(numberProblem(fields, { seats: "1.234,5" }, "de-DE")).toBe("")
  })
  it("says which answer isn't a number, in the server's words", () => {
    expect(numberProblem(fields, { seats: "1,5" }, "en-US")).toBe("“Seats” needs a number.")
    expect(numberProblem(fields, { seats: "12 kg" }, "de-DE")).toBe("“Seats” needs a number.")
  })
  it("leaves an empty answer to the server's required check", () => {
    expect(numberProblem(fields, { seats: "  " }, "de-DE")).toBe("")
    expect(numberProblem(fields, {}, "de-DE")).toBe("")
  })
})
