import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { LoadFailedRow } from "./load-failed-row"

afterEach(cleanup)

const words = "Couldn't load the calendars beside yours, so their busy times aren't shown."

describe("a row that says part of a page couldn't load", () => {
  it("says it as a status, with Try again, and can't be dismissed", () => {
    const retry = vi.fn()
    render(<LoadFailedRow shown onRetry={retry}>{words}</LoadFailedRow>)
    expect(screen.getByRole("status").textContent).toContain(words)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("keeps Try again's name while it reads again, busy in place", () => {
    render(<LoadFailedRow shown retrying onRetry={vi.fn()}>{words}</LoadFailedRow>)
    expect(screen.getByRole("button", { name: "Try again" }).getAttribute("aria-busy")).toBe("true")
  })

  it("fades out once what it names has loaded, then goes", () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(<LoadFailedRow shown onRetry={vi.fn()}>{words}</LoadFailedRow>)
      rerender(<LoadFailedRow shown={false} onRetry={vi.fn()}>{words}</LoadFailedRow>)
      expect(screen.getByText(words).closest("[data-load-failed-row]")?.hasAttribute("data-leaving")).toBe(true)
      act(() => {
        vi.advanceTimersByTime(160)
      })
      expect(screen.queryByText(words)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("says nothing while what it names hasn't failed", () => {
    render(<LoadFailedRow shown={false} onRetry={vi.fn()}>{words}</LoadFailedRow>)
    expect(screen.queryByText(words)).toBeNull()
  })
})
