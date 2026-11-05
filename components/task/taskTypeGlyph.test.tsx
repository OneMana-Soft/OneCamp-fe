import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { BadgeCheck, CircleCheck, CircleDot } from "@/lib/icons"
import { SquareCheck, Stamp } from "@/lib/workIcons"
import TaskTypeGlyph, { TYPE_ICONS } from "./TaskTypeGlyph"

// STEP4 #8 (DESIGN-BUILD-2, 17 Oct): round marks mean status, the status
// glyphs and Mark complete's ring around its check, so a type's glyph is never
// round. With Task's a circled check, Mark complete's ring read as a type, and
// Approval's badge was close to it.

afterEach(cleanup)

describe("a type's glyph", () => {
  it("is Jira's square check for a task, and a stamp for an approval", () => {
    expect(TYPE_ICONS.task).toBe(SquareCheck)
    expect(TYPE_ICONS.approval).toBe(Stamp)
  })

  it("is never one of the round marks that mean status", () => {
    const round = [CircleCheck, BadgeCheck, CircleDot]
    expect(Object.entries(TYPE_ICONS).filter(([, icon]) => round.includes(icon as never)).map(([name]) => name)).toEqual([])
  })

  it("draws a task's square check, named, for an icon name it doesn't know", () => {
    render(<TaskTypeGlyph type={{ icon: "retired-icon", name: "Spike" }} />)
    const glyph = screen.getByRole("img", { name: "Spike" })
    expect(glyph.querySelector("svg")!.getAttribute("class")).toContain("lucide-square-check")
  })

  // linear-03: beside its type's name (a Type filter's choices and chip, a
  // list's group header), a named glyph made a screen reader say "Bug Bug",
  // and the filter's Type facet "Task Type".
  it("beside its name, is drawn for the eye only, and says which glyph it drew", () => {
    const { container } = render(
      <p>
        <TaskTypeGlyph type={{ icon: "bug", name: "Bug" }} decorative />
        Bug
      </p>,
    )
    expect(screen.queryByRole("img")).toBeNull()
    const glyph = container.querySelector("[data-type-glyph]")!
    expect(glyph.getAttribute("aria-hidden")).toBe("true")
    expect(glyph.getAttribute("data-type-glyph")).toBe("bug")
    expect(glyph.hasAttribute("title")).toBe(false)
    // Alone, it is still named.
    cleanup()
    render(<TaskTypeGlyph type={{ icon: "retired-icon", name: "Spike" }} />)
    expect(screen.getByRole("img", { name: "Spike" }).getAttribute("data-type-glyph")).toBe("task")
  })
})
