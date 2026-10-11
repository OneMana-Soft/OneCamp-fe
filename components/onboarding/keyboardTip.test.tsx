import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { KeyboardTip, SHOW_AFTER_MS } from "./KeyboardTip"

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const wait = () => act(() => vi.advanceTimersByTime(SHOW_AFTER_MS + 100))
const tip = () => screen.queryByRole("complementary", { name: "Keyboard tips" })

describe("the keyboard tip", () => {
  it("waits, then shows the three keys", () => {
    render(<KeyboardTip />)
    expect(tip()).toBeNull()
    wait()
    expect(tip()).toBeTruthy()
    expect(screen.getByText("Search or ask")).toBeTruthy()
    expect(screen.getByText("All shortcuts")).toBeTruthy()
  })

  it("is gone for good after Got it", () => {
    const { unmount } = render(<KeyboardTip />)
    wait()
    fireEvent.click(screen.getByRole("button", { name: "Got it" }))
    expect(tip()).toBeNull()
    unmount()
    render(<KeyboardTip />)
    wait()
    expect(tip()).toBeNull()
  })

  it("opens the full list from See all", () => {
    const opened = vi.fn()
    window.addEventListener("onecamp:shortcuts", opened)
    render(<KeyboardTip />)
    wait()
    fireEvent.click(screen.getByRole("button", { name: "See all" }))
    expect(opened).toHaveBeenCalledOnce()
    expect(tip()).toBeNull()
    window.removeEventListener("onecamp:shortcuts", opened)
  })

  it("never shows to someone who already presses the keys", () => {
    render(<KeyboardTip />)
    fireEvent.keyDown(document, { key: "k", ctrlKey: true })
    wait()
    expect(tip()).toBeNull()
  })

  it("never shows on a phone", () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    render(<KeyboardTip />)
    wait()
    expect(tip()).toBeNull()
  })
})

// Design v3 (E7): --pop r12 e3 at 300px; a key pressed while it shows
// presses its chip and ticks its row, which teaches by doing.
describe("the keyboard tip's look", () => {
  it("is the 300px popover card, its Got it a quiet ghost", () => {
    render(<KeyboardTip />)
    wait()
    expect(tip()!.className).toContain("ktip")
    expect(screen.getByRole("button", { name: "Got it" }).className).not.toMatch(/\bbg-brand\b/)
  })

  it("presses the chip of a key pressed while it shows, and ticks the row", () => {
    render(<KeyboardTip />)
    wait()
    act(() => void fireEvent.keyDown(document, { key: "?" }))
    // The corner stack portals the card, so it is found in the document.
    const row = document.querySelector('[data-row="help"]')!
    expect(row.querySelector("kbd")?.hasAttribute("data-pressed")).toBe(true)
    expect(row.querySelector('[aria-label="Tried"]')).not.toBeNull()
    act(() => void fireEvent.keyUp(document, { key: "?" }))
    expect(row.querySelector("kbd")?.hasAttribute("data-pressed")).toBe(false)
    expect(tip()).toBeTruthy()
  })
})
