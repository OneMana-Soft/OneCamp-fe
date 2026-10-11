import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { ConnectionPill } from "@/components/docEditor/ConnectionPill"
import { RecoveredEditsBanner } from "@/components/docEditor/RecoveredEditsBanner"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("a doc the server could not open", () => {
  it("says so, with Retry, instead of showing an empty doc", () => {
    vi.useFakeTimers()
    const onRetry = vi.fn()
    render(<ConnectionPill problem="unavailable" onRetry={onRetry} />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole("status").textContent).toMatch(/Couldn.t open this doc\./)
    screen.getByRole("button", { name: "Retry" }).click()
    expect(onRetry).toHaveBeenCalled()
  })
})

describe("edits kept aside when the doc changed underneath", () => {
  it("offers them to copy, and can be dismissed", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const onDismiss = vi.fn()
    render(<RecoveredEditsBanner recovered={{ html: "<p>typed offline</p>", text: "typed offline", at: 1 }} onDismiss={onDismiss} />)
    expect(screen.getByRole("status").textContent).toMatch(/your unsaved edits weren.t added/)
    await act(async () => screen.getByRole("button", { name: "Copy your edits" }).click())
    expect(writeText).toHaveBeenCalledWith("typed offline")
    screen.getByRole("button", { name: "Dismiss" }).click()
    expect(onDismiss).toHaveBeenCalled()
  })
})
