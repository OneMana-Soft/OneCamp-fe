import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { VerdictChip } from "./GuestReview"

// Integration review, 12 Oct: on a client's board (264px columns) a card's
// "Changes requested · Priya (Acme)" kept its words' width beside the due
// date and pushed the assignee's avatar out past the card's edge.
describe("a verdict chip in a card's row", () => {
  afterEach(cleanup)

  it("can shrink, and gives way at the client's name while the verdict stays whole", () => {
    const { container } = render(
      <VerdictChip review={{ decision: "changes", name: "Priya (Acme)", created_at: "2026-10-11T09:00:00Z" }} />,
    )
    const chip = container.querySelector("[data-verdict]") as HTMLElement
    expect(chip.className).toMatch(/(^| )min-w-0( |$)/)
    const by = chip.querySelector("[data-verdict-by]") as HTMLElement
    expect(by.textContent).toBe("· Priya (Acme)")
    expect(by.className).toMatch(/(^| )truncate( |$)/)
    expect(by.className).toMatch(/(^| )min-w-0( |$)/)
    const word = by.previousElementSibling as HTMLElement
    expect(word.textContent).toBe("Changes requested")
    expect(word.className).toMatch(/(^| )shrink-0( |$)/)
    expect(chip.getAttribute("title")).toBe("Changes requested by Priya (Acme)")
  })
})
