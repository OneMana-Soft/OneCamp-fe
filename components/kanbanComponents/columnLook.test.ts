import { describe, expect, it } from "vitest"

import { BUILT_IN_STATUSES, type StatusOption } from "@/lib/taskStatus"
import { columnHue, columnLozenge, columnWash } from "./columnLook"

const builtIn = (value: string) => BUILT_IN_STATUSES.find((s) => s.value === value)!

// The rivals review (16 Oct 2026): Notion tints each status column and heads
// it with a coloured pill; ours were grey wells, with colour only in glyphs.
describe("a board column's colour", () => {
  it("is its status's: a built-in one's category hue, the colour its glyph draws in", () => {
    expect(columnHue(builtIn("inProgress"))).toBe("sun")
    expect(columnHue(builtIn("inReview"))).toBe("dusk")
    expect(columnHue(builtIn("done"))).toBe("moss")
  })

  it("leaves to do, backlog, cancelled and a person's column neutral", () => {
    for (const v of ["todo", "backlog", "canceled"]) expect(columnHue(builtIn(v))).toBeNull()
    const person: StatusOption = { value: "u1", label: "Ana", category: "todo", custom: false, color: "" }
    expect(columnHue(person)).toBeNull()
    expect(columnHue(undefined)).toBeNull()
  })

  it("takes a custom status's own hue, and none for a neutral one", () => {
    expect(columnHue({ value: "qa", label: "QA", category: "inReview", custom: true, color: "", hue: "berry" })).toBe("berry")
    expect(columnHue({ value: "idea", label: "Idea", category: "todo", custom: true, color: "", hue: "neutral" })).toBeNull()
  })

  it("washes a hued column with half its tint, and keeps a neutral one on the sunken well", () => {
    expect(columnWash("sun")).toContain("hue-sun")
    expect(columnWash("sun")).toContain("bg-[color-mix(in_oklab,var(--hue-tint)_50%,var(--sunken))]")
    expect(columnWash("sun")).not.toMatch(/(^|\s)bg-sunken(\s|$)/)
    expect(columnWash(null)).toMatch(/(^|\s)bg-sunken(\s|$)/)
  })

  it("heads it with a lozenge in the hue's ink on its tint, or a neutral one", () => {
    expect(columnLozenge("moss")).toBe("bg-hue-tint text-hue-ink")
    expect(columnLozenge(null)).toBe("bg-hover text-foreground")
  })
})
