import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { DatePanel } from "@/components/ui/date-field-panels"
import { SHEET_MONTH } from "@/components/ui/sheetMonth"

// DESIGN-BUILD-3, 21 Oct: held sideways, a date field's panel opened on the
// month's first row, the only days in view past ones, over the pinned Pause.
// In a sheet the chosen week comes into view as the panel opens, under the
// month's name and its weekdays, which stay at the top of the sheet's scroller.

pinTestClock(new Date(2026, 9, 21, 10, 0))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The panel, opened, and what it scrolled into view. */
async function opened(sheet: boolean) {
  const seen: Element[] = []
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
    seen.push(this)
  })
  render(<DatePanel day={new Date(2026, 9, 28)} clearable={false} sheet={sheet} onPick={() => {}} onClear={() => {}} />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return seen
}

describe("a date field's panel", () => {
  it("in a sheet, brings the chosen week into view as it opens", async () => {
    const row = (await opened(true)).find((el) => el.tagName === "TR")
    expect(row, "the chosen week's row").toBeTruthy()
    expect(Array.from(row!.querySelectorAll("button")).map((b) => b.textContent?.trim())).toContain("28")
  })

  it("keeps the month's name and weekdays at the top while the weeks scroll, and a week clear of them", () => {
    expect(SHEET_MONTH.caption).toMatch(/\bsticky\b.*\btop-0\b/)
    expect(SHEET_MONTH.head).toMatch(/\bsticky\b.*\btop-11\b/)
    expect(SHEET_MONTH.row).toContain("scroll-mt-16")
  })

  it("by its field (a popover), leaves the month where it is", async () => {
    expect((await opened(false)).filter((el) => el.tagName === "TR")).toEqual([])
  })
})
