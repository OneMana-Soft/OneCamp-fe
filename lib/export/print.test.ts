import { afterEach, describe, expect, it, vi } from "vitest"
import { printTitled } from "./print"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("printing under a title", () => {
  it("names the PDF after the title, gives the page's title back, and calls done once the dialog closes", () => {
    vi.useFakeTimers()
    document.title = "OneCamp"
    let during = ""
    vi.spyOn(window, "print").mockImplementation(() => {
      during = document.title
    })
    const done = vi.fn()
    printTitled("Launch retro", done)
    expect(during).toBe("Launch retro")
    window.dispatchEvent(new Event("afterprint"))
    expect(document.title).toBe("OneCamp")
    expect(done).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it("gives the title back a moment after print() returns where no afterprint comes, but leaves what was printed until it does", () => {
    // iOS Safari's print() can return before its dialog has drawn the page.
    vi.useFakeTimers()
    document.title = "OneCamp"
    vi.spyOn(window, "print").mockImplementation(() => {})
    const done = vi.fn()
    printTitled("Launch retro", done)
    vi.advanceTimersByTime(1500)
    expect(document.title).toBe("OneCamp")
    expect(done).not.toHaveBeenCalled()
    window.dispatchEvent(new Event("afterprint"))
    expect(done).toHaveBeenCalledTimes(1)
  })
})
