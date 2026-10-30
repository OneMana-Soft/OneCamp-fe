import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import { GuestAskNote } from "./GuestReview"

// R2b's design review, 23 Oct: what the team asks a client wrote its deadline as a
// bare "25 Oct" and "3:07 AM", two pieces that split over two lines in a 1280 board's
// column and, beside the task's own "26 Oct", read as a second due date.
describe("what the team asks a client, by when", () => {
  pinTestClock()
  afterEach(cleanup)

  const note = (due_at?: string) =>
    render(<GuestAskNote ask={{ ask: "Is this the final wording?", due_at, asked_by: "Maya Chen", asked_at: new Date().toISOString() }} compact />)
      .container.querySelector("[data-guest-ask]")!

  it("says the deadline as one phrase that never breaks, after what waits", () => {
    const by = note(new Date(2026, 9, 25, 3, 7).toISOString()).querySelector("[data-ask-due]")!
    expect(by.textContent).toBe("by 25 Oct, 3:07 AM")
    expect(by.className).toMatch(/(^| )whitespace-nowrap( |$)/)
    expect(by.className).not.toContain("danger")
  })

  it("says a deadline that has passed in danger ink", () => {
    const by = note(new Date(Date.now() - 2 * 3600_000).toISOString()).querySelector("[data-ask-due]")!
    expect(by.textContent).toMatch(/^by /)
    expect(by.className).toContain("text-danger-ink")
  })

  it("says no deadline when none was set", () => {
    const ask = note()
    expect(ask.querySelector("[data-ask-due]")).toBeNull()
    expect(ask).toHaveTextContent("Waiting for your approval")
  })
})
