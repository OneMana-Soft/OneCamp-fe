import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { KeyboardTip, SHOW_AFTER_MS } from "./KeyboardTip"

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
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
    expect(screen.getByText("Open a link side by side")).toBeTruthy()
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

  it("opens the full list from its button", () => {
    const opened = vi.fn()
    window.addEventListener("onecamp:shortcuts", opened)
    render(<KeyboardTip />)
    wait()
    fireEvent.click(screen.getByRole("button", { name: "See all shortcuts" }))
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
})

describe("the keyboard tip's look", () => {
  it("floats on the overlay shadow, with its close named for what it closes", () => {
    render(<KeyboardTip />)
    wait()
    expect(tip()!.className).toMatch(/\bshadow-overlay\b/)
    expect(tip()!.className).not.toMatch(/\bshadow-lg\b/)
    const close = screen.getByRole("button", { name: "Close the keyboard tips" })
    expect(close.className).toMatch(/hover:bg-highlight/)
  })

  it("leaves the page's one filled button to the page", () => {
    render(<KeyboardTip />)
    wait()
    expect(screen.getByRole("button", { name: "Got it" }).className).not.toMatch(/\bbg-primary\b/)
  })

  it("reads what each key does in ink, beside quiet keys", () => {
    render(<KeyboardTip />)
    wait()
    expect(screen.getByText("Find anything, or run any command").className).toMatch(/\btext-foreground\b/)
  })
})
