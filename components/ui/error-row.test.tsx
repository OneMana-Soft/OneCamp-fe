import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ErrorRow } from "./error-row"

// A held slot with room for a line (Who knows on the search page, DESIGN-BUILD-16,
// 25 Oct): ErrorState's compact form, its spot, title, two lines and button, stood
// taller than the slot, so Try again fell below its fold. One row: the spot, the
// words, and Try again at the row's end.
describe("ErrorRow", () => {
  // vitest runs without globals here, so testing-library's auto-cleanup is never
  // registered and renders otherwise accumulate across tests.
  beforeEach(cleanup)

  it("draws one row in a slot with room for a line: the spot, the words, and Try again at its end", () => {
    const retry = vi.fn()
    const { container } = render(<ErrorRow subject="who knows about this" onRetry={retry} />)
    const row = container.firstElementChild as HTMLElement
    expect(row.querySelector("svg[data-spot]")).toBeTruthy()
    expect(row.textContent).toContain("Couldn't load who knows about this")
    expect(screen.queryByText(/Nothing has been lost/)).toBeNull()
    const again = screen.getByRole("button", { name: /try again/i })
    expect(row.lastElementChild).toBe(again)
    fireEvent.click(again)
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
