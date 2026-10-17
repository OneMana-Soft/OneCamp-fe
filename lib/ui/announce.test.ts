import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { LiveRegion, announce } from "./announce"

// The app's one polite live region (INTERACTION_SPEC §7.5).
afterEach(() => {
  cleanup()
  document.querySelectorAll("[data-announce]").forEach((n) => n.remove())
  vi.useRealTimers()
})

const region = () => document.querySelector<HTMLElement>("[data-announce]")

describe("announce", () => {
  it("says the words through the layout's region: polite, read whole, out of sight", () => {
    vi.useFakeTimers()
    render(createElement(LiveRegion))
    announce("Picked up Launch plan. To do.")
    vi.advanceTimersByTime(100)
    expect(document.querySelectorAll("[data-announce]")).toHaveLength(1)
    const r = region()!
    expect(r.textContent).toBe("Picked up Launch plan. To do.")
    expect(r.getAttribute("role")).toBe("status")
    expect(r.getAttribute("aria-live")).toBe("polite")
    expect(r.getAttribute("aria-atomic")).toBe("true")
    expect(r.className).toContain("sr-only")
  })

  it("empties the region first, so the same words said twice are spoken twice", () => {
    vi.useFakeTimers()
    announce("Position 2 of 5.")
    vi.advanceTimersByTime(100)
    announce("Position 2 of 5.")
    expect(region()!.textContent).toBe("")
    vi.advanceTimersByTime(100)
    expect(region()!.textContent).toBe("Position 2 of 5.")
  })

  it("makes a region on a page that has none (a public page)", () => {
    vi.useFakeTimers()
    expect(region()).toBeNull()
    announce("Dropped.")
    vi.advanceTimersByTime(100)
    expect(region()!.textContent).toBe("Dropped.")
  })
})
