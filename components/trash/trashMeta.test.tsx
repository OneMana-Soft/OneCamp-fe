import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { TrashMeta } from "@/components/trash/TrashMeta"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

// The line under a trash row's name, which docs' trash and the tables' trash
// share: "Deleted just now by Sam Rivera". "by" and the name sit in one inline
// box (DB-50), so a narrow row breaks before "by", the name wraps only between
// its words, and only a single word longer than the row breaks inside itself.
// Where the line breaks is pinned in e2e/tables/tablesTrash.spec.ts at 1280
// and at 390.

// The clock stands still, so "just now" reads the same every day.
pinTestClock()
const now = TEST_TODAY.toISOString()
const NO_BREAK_SPACE = String.fromCharCode(0xa0)

afterEach(cleanup)

describe("a trash row's line", () => {
  it("holds “by” and the name in one box, joined by ordinary spaces", () => {
    const { container } = render(<TrashMeta verb="Deleted" at={now} who="Mary Ann Rivera" />)
    const line = container.querySelector("p") as HTMLElement
    expect(line.textContent).toBe("Deleted just now by Mary Ann Rivera")
    expect(line.textContent, "no-break spaces would split a long name mid-word").not.toContain(NO_BREAK_SPACE)
    const box = Array.from(line.querySelectorAll("span")).find((span) => span.textContent === "by Mary Ann Rivera")
    expect(box, "“by” and the name are one element").toBeDefined()
    expect(box?.classList.contains("inline-block"), "the box moves to the next line whole").toBe(true)
    expect(box?.classList.contains("max-w-full"), "the box is never wider than the line, so a long name wraps inside it").toBe(true)
  })

  it("lets a name longer than the row wrap, in docs' trash and the tables' alike", () => {
    // The tables' trash passes no classes; docs' trash clamps on phones and truncates on wider screens.
    for (const className of [undefined, "max-sm:line-clamp-2 sm:truncate"]) {
      const { container, unmount } = render(<TrashMeta verb="Deleted" at={now} who="Sam Rivera" className={className} />)
      const line = container.querySelector("p") as HTMLElement
      expect(line.classList.contains("break-words")).toBe(true)
      for (const own of className?.split(" ") ?? []) expect(line.classList.contains(own)).toBe(true)
      unmount()
    }
  })

  it("names nobody when the server sent no name", () => {
    const { container } = render(<TrashMeta verb="Deleted" at={now} />)
    expect(container.querySelector("p")?.textContent).toBe("Deleted just now")
  })
})
