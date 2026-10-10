import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The last-resort error page, shown in place of the whole app. Its button
// says "Reload", and for an ordinary error it only re-rendered the same tree,
// which usually threw again: the person pressed it and nothing changed. It
// reloads the page now, as it says.

import GlobalError from "./global-error"

const reload = vi.fn()

afterEach(() => {
  cleanup()
  reload.mockReset()
  vi.restoreAllMocks()
})

describe("the last-resort error page", () => {
  it("reloads the page when Reload is pressed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {}) // <html> inside the test's <div>
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true })
    const reset = vi.fn()
    render(<GlobalError error={new Error("boom")} reset={reset} />)
    fireEvent.click(screen.getByRole("button", { name: "Reload" }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })
})
