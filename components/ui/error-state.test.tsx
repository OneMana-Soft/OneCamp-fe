import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ErrorState } from "./error-state"

/**
 * The component is small; what matters is the sentence it says and that it is a
 * way out rather than a dead end.
 *
 * The bug it exists for: SWR leaves `data` undefined on failure, so
 * `items.length === 0` is true and the page renders its empty state. Five
 * surfaces were telling users their work did not exist when a request had merely
 * failed — "No tables yet", "You haven't created any posts yet". So the copy has
 * to do two jobs: attribute the failure to the request, and explicitly rule out
 * the frightening reading.
 */
describe("ErrorState", () => {
  // vitest runs without globals here, so testing-library's auto-cleanup is never
  // registered and renders otherwise accumulate across tests.
  beforeEach(cleanup)

  it("blames the request, not the user's data", () => {
    render(<ErrorState subject="your tables" />)
    expect(screen.getByText("Couldn't load your tables")).toBeTruthy()
  })

  it("says nothing has been lost, which is the question the user actually has", () => {
    render(<ErrorState subject="your boards" />)
    // The distressing reading of a blank list is "my work is gone". Leaving that
    // unaddressed is what made the empty state alarming in the first place.
    expect(screen.getByText(/Nothing has been lost/i)).toBeTruthy()
  })

  it("offers a retry, so the surface is not a dead end", () => {
    const retry = vi.fn()
    render(<ErrorState subject="templates" onRetry={retry} />)
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("cannot be double-fired while a retry is in flight", () => {
    const retry = vi.fn()
    render(<ErrorState subject="templates" onRetry={retry} retrying />)
    const btn = screen.getByRole("button", { name: /retrying/i })
    fireEvent.click(btn)
    expect(retry).not.toHaveBeenCalled()
    expect(btn.hasAttribute("disabled")).toBe(true)
  })

  it("renders without a retry when there is genuinely nothing to retry", () => {
    render(<ErrorState subject="this channel" />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("does not shout — a failed list fetch is usually a blip, not an alarm", () => {
    const { container } = render(<ErrorState subject="x" />)
    // A full destructive-tinted panel for something a retry fixes teaches people
    // to distrust the surface. The icon carries the meaning.
    expect(container.innerHTML).not.toMatch(/bg-destructive(?!\/0)/)
  })
})
