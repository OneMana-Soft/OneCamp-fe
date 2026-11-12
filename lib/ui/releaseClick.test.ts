import { afterEach, describe, expect, it, vi } from "vitest"

import { swallowReleaseClick } from "./releaseClick"

// The click a press's release sends, swallowed wherever it lands (lib/ui/releaseClick): the event card's sheet rose
// under the finger and its scrim took the click and shut it, when a slow phone sent that click late (gcal-15 B).
const click = (detail = 1) => document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }))
const fakeClock = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] })

describe("swallowReleaseClick", () => {
  const heard = vi.fn()
  afterEach(() => {
    window.removeEventListener("click", heard)
    heard.mockReset()
    // A test that left one waiting: a new press ends it.
    window.dispatchEvent(new Event("pointerdown"))
    vi.useRealTimers()
  })

  it("swallows the release's click as late as a slow phone sends it, and only that one", () => {
    fakeClock()
    window.addEventListener("click", heard)
    swallowReleaseClick()
    // At 6x CPU the tap's click came 1.4 s after the release, onto the scrim of the card it opened (V-872).
    vi.advanceTimersByTime(1_400)
    expect(click(), "the release's click is cancelled").toBe(false)
    expect(heard, "the release's click").not.toHaveBeenCalled()
    expect(vi.getTimerCount(), "the wait's bound, ended with it").toBe(0)
    click()
    expect(heard, "the next click").toHaveBeenCalledTimes(1)
  })

  // A release may send no click (a hold past the browser's own long press, a finger that moved): the wait must not
  // eat a later click that no press comes before, such as a screen reader's double-tap with no touch events (V-878).
  it("lets a click with no press before it through once 2.5 s have passed", () => {
    fakeClock()
    window.addEventListener("click", heard)
    swallowReleaseClick()
    vi.advanceTimersByTime(2_499)
    expect(vi.getTimerCount(), "still waiting for the release's click").toBe(1)
    vi.advanceTimersByTime(1)
    expect(click(), "a click 2.5 s on, after a release that sent none").toBe(true)
    expect(heard, "that click").toHaveBeenCalledTimes(1)
  })

  it("ends the wait at a key, and the next click goes through", () => {
    fakeClock()
    window.addEventListener("click", heard)
    swallowReleaseClick()
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }))
    expect(vi.getTimerCount(), "the wait's bound, ended with it").toBe(0)
    click()
    expect(heard, "a click after a key, with no press before it").toHaveBeenCalledTimes(1)
  })

  it("leaves a new press its own click", () => {
    window.addEventListener("click", heard)
    swallowReleaseClick()
    window.dispatchEvent(new Event("touchstart"))
    click()
    expect(heard, "a new touch's click").toHaveBeenCalledTimes(1)
    swallowReleaseClick()
    window.dispatchEvent(new Event("pointerdown"))
    click()
    expect(heard, "a new press's click").toHaveBeenCalledTimes(2)
  })

  it("never swallows a key's click, which no release sends", () => {
    window.addEventListener("click", heard)
    swallowReleaseClick()
    click(0)
    expect(heard, "Enter on a button, after a release").toHaveBeenCalledTimes(1)
    click()
    expect(heard, "the release's click, still swallowed after it").toHaveBeenCalledTimes(1)
  })
})
