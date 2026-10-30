import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { addressLater } from "./addressLater"

// A list's address write waits a moment, and never cancels a move the person
// made in the meantime (e2e/myTaskKeepsClick.spec.ts shows the lost click).

describe("addressLater", () => {
  let stop = () => {}
  beforeEach(() => {
    vi.useFakeTimers()
    history.replaceState(null, "", "/app/myTask?tab=list")
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("writes once, after the wait", () => {
    const write = vi.fn()
    stop = addressLater(write, 300)
    vi.advanceTimersByTime(299)
    expect(write).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(write).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("writes at once on a press, before the press reaches what it pressed, and not again", () => {
    const write = vi.fn()
    const link = document.body.appendChild(document.createElement("a"))
    let writtenBeforeTheLink = false
    link.addEventListener("pointerdown", () => (writtenBeforeTheLink = write.mock.calls.length == 1))
    stop = addressLater(write, 300)
    link.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(writtenBeforeTheLink).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("writes at once on Enter outside a text field; typing in one, or a plain key (a calendar's J), waits", () => {
    const write = vi.fn()
    const input = document.body.appendChild(document.createElement("input"))
    stop = addressLater(write, 300)
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }))
    expect(write).not.toHaveBeenCalled()
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("writes at once on a chord (Back, the palette)", () => {
    const write = vi.fn()
    stop = addressLater(write, 300)
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true }))
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("writes at once when the page is left", () => {
    const write = vi.fn()
    stop = addressLater(write, 1000)
    dispatchEvent(new Event("pagehide"))
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("drops the write on Back or Forward", () => {
    const write = vi.fn()
    stop = addressLater(write, 300)
    dispatchEvent(new PopStateEvent("popstate"))
    vi.advanceTimersByTime(1000)
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(write).not.toHaveBeenCalled()
  })

  it("drops the write once another page shows", () => {
    const write = vi.fn()
    stop = addressLater(write, 300)
    history.pushState(null, "", "/app/inbox")
    vi.advanceTimersByTime(1000)
    expect(write).not.toHaveBeenCalled()
  })

  it("does nothing once stopped, a press included", () => {
    const write = vi.fn()
    addressLater(write, 300)()
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    vi.advanceTimersByTime(1000)
    expect(write).not.toHaveBeenCalled()
  })
})
