import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { DueLabel, dueWords } from "@/components/task/DueLabel"

afterEach(cleanup)

/** The due label (work.md W05): words within a day, one tinted chip (Today), overdue in danger ink, done in ink-3. */
const now = new Date(2026, 9, 11, 10, 0)
const at = (d: number, y = 2026) => new Date(y, 9, d, 15, 0)

describe("the due label", () => {
  it("says Today, Tomorrow and Yesterday within a day, and a short date beyond", () => {
    expect(dueWords(at(11), now)).toBe("Today")
    expect(dueWords(at(12), now)).toBe("Tomorrow")
    expect(dueWords(at(10), now)).toBe("Yesterday")
    expect(dueWords(at(14), now)).toBe("14 Oct")
    expect(dueWords(at(14, 2027), now)).toBe("14 Oct 2027")
  })

  it("tints only Today, in sun", () => {
    const { container } = render(<DueLabel date={at(11)} now={now} />)
    const label = container.querySelector("[data-due]")!
    expect(label.getAttribute("data-due")).toBe("today")
    expect(label.className).toContain("bg-camp-sun-tint")
    cleanup()
    const later = render(<DueLabel date={at(14)} now={now} />).container.querySelector("[data-due]")!
    expect(later.className).not.toMatch(/bg-/)
  })

  it("writes overdue in danger ink with no chip in a row, and a chip in the panel", () => {
    const row = render(<DueLabel date={at(3)} now={now} />).container.querySelector("[data-due]")!
    expect(row.className).toContain("text-danger-ink")
    expect(row.className).not.toMatch(/bg-/)
    cleanup()
    const panel = render(<DueLabel date={at(3)} now={now} variant="panel" />).container.querySelector("[data-due]")!
    expect(panel.className).toContain("bg-destructive/10")
  })

  it("draws a done task's date in ink-3, with no colour", () => {
    const done = render(<DueLabel date={at(3)} now={now} done />).container.querySelector("[data-due]")!
    expect(done.getAttribute("data-due")).toBe("done")
    expect(done.className).toContain("text-ink-3")
    expect(done.className).not.toContain("danger")
  })

  it("draws nothing for no date", () => {
    expect(render(<DueLabel date="0001-01-01T00:00:00Z" />).container.innerHTML).toBe("")
  })
})
