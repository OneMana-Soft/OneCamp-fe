import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { GlobalErrorBoundary } from "@/components/error/GlobalErrorBoundary"
import { LocalizedErrorBoundary } from "@/components/error/LocalizedErrorBoundary"
import { ErrorState as LegacyErrorState } from "@/components/error/errorState"

// What the app says when something breaks: what happened, that nothing saved
// is lost, and the one thing to do. And a broken page no longer takes the
// sidebar with it.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

let shouldThrow = true
function Boom() {
  if (shouldThrow) throw new Error("boom")
  return <p>Back to normal</p>
}

describe("a page that crashes inside the app", () => {
  const ROUTE_ERROR = join(__dirname, "..", "..", "app", "app", "error.tsx")

  // There was no route-level error page, so a crash in any page reached the
  // boundary around the whole app, which drew over the sidebar and the top
  // bar: one broken page took the way to every other page with it.
  it("is caught inside the app's frame, by a route error page", () => {
    expect(existsSync(ROUTE_ERROR)).toBe(true)
    expect(readFileSync(ROUTE_ERROR, "utf8")).toMatch(/^"use client"/)
  })

  it("says the rest still works, tries again, and offers Home", async () => {
    const { default: AppRouteError } = await import("@/app/app/error")
    const reset = vi.fn()
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<AppRouteError error={new Error("boom")} reset={reset} />)
    expect(screen.getByRole("heading", { name: "This page hit a problem" })).toBeInTheDocument()
    expect(screen.getByText(/nothing you saved is lost/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalled()
    expect(screen.getByRole("link", { name: /go to home/i }).getAttribute("href")).toBe("/app/home")
    // The playful layer's error spot above the heading, decorative.
    expect(document.querySelector("[data-empty-illustration] svg")).not.toBeNull()
  })
})

describe("a crash the app can't recover from", () => {
  // It claimed "We've been notified and are looking into it". Nothing reports
  // errors anywhere, and on a server the customer runs there is nobody to tell.
  it("says what is true and offers one way on: reload", () => {
    shouldThrow = true
    vi.spyOn(console, "error").mockImplementation(() => {})
    const reload = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location)
    render(
      <GlobalErrorBoundary>
        <Boom />
      </GlobalErrorBoundary>,
    )
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/couldn't recover/i)
    expect(document.body.textContent).not.toMatch(/notified|looking into it/i)
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(document.querySelector("[data-empty-illustration] svg")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Reload page" }))
    expect(reload).toHaveBeenCalled()
  })
})

describe("one part of a page that crashes", () => {
  it("says so in plain words, quietly, and can try that part again", () => {
    shouldThrow = true
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(
      <LocalizedErrorBoundary>
        <Boom />
      </LocalizedErrorBoundary>,
    )
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toMatch(/This part of the page hit a problem/)
    // Not a dashed red slab: a hairline box like the lists around it.
    expect(alert.className).not.toMatch(/border-dashed|bg-destructive/)
    shouldThrow = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(screen.getByText("Back to normal")).toBeInTheDocument()
  })
})

describe("the older error state still used by chat panels", () => {
  it("says Try again in sentence case", () => {
    render(<LegacyErrorState errorTitle="Couldn't load the thread" errorMessage="Try again in a moment." onRetry={() => {}} />)
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})
