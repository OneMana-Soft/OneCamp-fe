import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// How often a date is put into words (date-fns' format), for the list's own test.
const formats = vi.hoisted(() => ({ n: 0 }))
vi.mock("date-fns", async (orig) => {
  const real = await orig<typeof import("date-fns")>()
  return { ...real, format: (...a: Parameters<typeof real.format>) => (formats.n++, real.format(...a)) }
})

import { DueLabel, dueWords } from "@/components/task/DueLabel"
import { dueByWords } from "@/components/task/dueByWords"

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

  // fluid-17: a phone's list of 380 rows put every row's date into words again.
  it("words a day once, however many rows show it", () => {
    formats.n = 0
    const { container } = render(<>{Array.from({ length: 50 }, (_, i) => <DueLabel key={i} date={at(20)} now={now} />)}</>)
    expect(container.querySelectorAll("[data-due]")[49].textContent).toBe("20 Oct")
    expect(formats.n).toBeLessThanOrEqual(1)
  })

  // R2b's design review, 23 Oct: a client's card wrote an answer's deadline as a bare "25 Oct" and
  // "3:07 AM" beside the task's own due date, so it read as a second due date, split over two lines.
  it("says a deadline as a phrase after what waits for it, with its time, the day's words mid-sentence", () => {
    expect(dueByWords(at(11), now)).toBe("by today, 3:00 PM")
    expect(dueByWords(at(12), now)).toBe("by tomorrow, 3:00 PM")
    expect(dueByWords(at(10), now)).toBe("by yesterday, 3:00 PM")
    expect(dueByWords(at(14), now)).toBe("by 14 Oct, 3:00 PM")
    expect(dueByWords(at(14, 2027), now)).toBe("by 14 Oct 2027, 3:00 PM")
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

  // design-23: beside the panel's dates, a later due date was said again in grey ("29 Oct → 31 Oct  31 Oct").
  it("in the panel, says only what the dates beside it don't: Due tomorrow, and nothing for a later day", () => {
    expect(render(<DueLabel date={at(12)} now={now} variant="panel" />).container.textContent).toBe("Due tomorrow")
    cleanup()
    expect(render(<DueLabel date={at(20)} now={now} variant="panel" />).container.querySelector("[data-due]")).toBeNull()
    cleanup()
    expect(render(<DueLabel date={at(11)} now={now} variant="panel" />).container.textContent).toBe("Due today")
  })
})
