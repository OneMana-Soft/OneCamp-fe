import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ColumnMark } from "@/components/kanbanComponents/Container/Container"
import type { BoardOption } from "@/lib/board/groupBy"

// CODE-REVIEWER-208, P10-a F1 (4 Nov 2026): on a board grouped by type, a
// column's heading is its mark and its name. The type's glyph was named, so
// the heading read "Bug Bug". Every place that draws a ColumnMark (the
// column's heading, its collapsed button, the card sheet's row) writes the
// name beside it, so the mark is for the eye only.

afterEach(cleanup)

const bug: BoardOption = {
  value: "wt-bug",
  label: "Bug",
  category: "todo",
  custom: false,
  color: "",
  workType: { id: "wt-bug", builtin: "bug", name: "Bug", icon: "bug" },
}

describe("a board column's mark beside its name", () => {
  it("names a type's column once: its heading is the type's name alone", () => {
    render(
      <h2>
        <ColumnMark status={bug} />
        Bug
      </h2>,
    )
    expect(screen.getByRole("heading", { name: "Bug" })).toBeTruthy()
    expect(screen.queryByRole("img")).toBeNull()
  })
})
