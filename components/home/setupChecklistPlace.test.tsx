import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ChecklistPlace, CHECKLIST_MEMO_KEY } from "./setupChecklistPlace"

// Home's stand-in while the setup checklist's own code loads (it is a chunk of
// its own): the card's shape where this browser last showed the card, so Home
// doesn't jump when it lands, and nothing where it was finished or hidden.
afterEach(() => {
  cleanup()
  localStorage.removeItem(CHECKLIST_MEMO_KEY)
})

describe("the setup checklist's place", () => {
  it("holds the card's shape where this browser last showed it, or hasn't seen it yet", () => {
    for (const memo of ["open", null]) {
      if (memo) localStorage.setItem(CHECKLIST_MEMO_KEY, memo)
      const { unmount } = render(<ChecklistPlace />)
      expect(screen.getByRole("status", { name: "Loading the setup checklist" })).toBeTruthy()
      unmount()
    }
  })

  it("holds nothing where the card was finished or hidden", () => {
    localStorage.setItem(CHECKLIST_MEMO_KEY, "closed")
    const { container } = render(<ChecklistPlace />)
    expect(container.textContent).toBe("")
  })
})
