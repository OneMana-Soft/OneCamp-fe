import { describe, expect, it } from "vitest"
import { orList } from "@/lib/utils/format/orList"

describe("choices in a sentence", () => {
  it("puts commas between them and an or before the last", () => {
    expect(orList([])).toBe("")
    expect(orList(["Done"])).toBe("Done")
    expect(orList(["Done", "Blocked"])).toBe("Done or Blocked")
    expect(orList([".csv", ".tsv", ".xlsx"])).toBe(".csv, .tsv or .xlsx")
  })
})
