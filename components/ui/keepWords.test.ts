import { describe, expect, it } from "vitest"
import { splitWords } from "@/components/ui/keepWords"

describe("splitWords", () => {
  it("cuts after the first words, and the rest keeps its leading space", () => {
    expect(splitWords("Webinar series for partners", 2)).toEqual(["Webinar series", " for partners"])
  })

  it("keeps a name of as many words or fewer whole", () => {
    expect(splitWords("Q4 launch", 2)).toEqual(["Q4 launch", ""])
    expect(splitWords("Importer", 2)).toEqual(["Importer", ""])
  })

  it("counts words, not spaces, and draws one space between them (CR-202)", () => {
    expect(splitWords("  SSO   for pilots ", 2)).toEqual(["SSO for", " pilots"])
    expect(splitWords(" \tQ4\n launch  ", 2)).toEqual(["Q4 launch", ""])
  })

  it("keeps no words when asked for none: the whole text may give (CR-202)", () => {
    expect(splitWords("Q4 launch", 0)).toEqual(["", "Q4 launch"])
    expect(splitWords("Q4 launch", -1)).toEqual(["", "Q4 launch"])
    expect(splitWords("Q4 launch", Number.NaN)).toEqual(["", "Q4 launch"])
  })
})
