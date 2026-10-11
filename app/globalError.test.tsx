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

describe("the last-resort page in design v3", () => {
  it("writes out v3's tokens: the frame, r8 buttons with the primary's highlight, Inter at 15/590", async () => {
    const src = (await import("node:fs")).readFileSync("app/global-error.tsx", "utf8")
    expect(src).toMatch(/--frame: #F3F4F6/)
    expect(src).toMatch(/border-radius: 8px/)
    expect(src).toMatch(/inset 0 1px 0 rgba\(255,255,255,\.2\)/)
    expect(src).toMatch(/font-size: 15px; line-height: 20px; font-weight: 590/)
  })

  it("draws the splash ring while it reloads into a new build", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true })
    const chunk = Object.assign(new Error("Loading chunk 12 failed."), { name: "ChunkLoadError" })
    const view = render(<GlobalError error={chunk} reset={vi.fn()} />)
    expect(view.container.textContent).toMatch(/OneCamp was just updated/)
    expect(view.container.querySelector("circle.draw")).toBeTruthy()
  })
})
