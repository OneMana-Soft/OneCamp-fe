import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Values cut short inside their own controls: a person's rate read "85, as
// everyon", a status's "Counts as In revie" and a new field's kind "Select ·
// One of a".
const read = (f: string) => readFileSync(`components/project/${f}`, "utf8")
describe("the project's setup dialogs", () => {
  it("give each value room for its words", () => {
    expect(read("ProjectRatesDialog.tsx")).toContain("grid-cols-[1fr_10rem]")
    expect(read("ProjectStatusesDialog.tsx")).not.toContain("w-[160px]")
    expect(read("ProjectFieldsDialog.tsx")).toContain("<SelectValue>{FIELD_TYPES.find((t) => t.value === type)?.label}</SelectValue>")
  })
})
