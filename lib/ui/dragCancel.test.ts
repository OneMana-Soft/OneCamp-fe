import { afterEach, describe, expect, it, vi } from "vitest"
import { onDragCancel } from "./dragCancel"

const stops: Array<() => void> = []
afterEach(() => {
  stops.splice(0).forEach((stop) => stop())
  document.body.innerHTML = ""
})

/** A drag holding the pointer with `holder`, listened to as the calendar's views do. */
function live(holder?: Element | null) {
  const cancel = vi.fn()
  stops.push(onDragCancel(cancel, holder))
  return cancel
}

const fire = (target: EventTarget, type: string) => target.dispatchEvent(new Event(type, { bubbles: true }))

describe("a drag's ways to end without landing", () => {
  it("ends on Escape, which goes no further; an Escape that ends a composition doesn't", () => {
    const under = vi.fn()
    document.addEventListener("keydown", under)
    try {
      const cancel = live()
      const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      document.body.dispatchEvent(key)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(key.defaultPrevented).toBe(true)
      expect(under).not.toHaveBeenCalled()
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }))
      expect(cancel).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener("keydown", under)
    }
  })

  it("ends when the browser takes the pointer for a scroll", () => {
    const pressed = document.body.appendChild(document.createElement("div"))
    const cancel = live()
    fire(pressed, "pointercancel")
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("ends when its holder loses the pointer, or has left the page, but not when another element hands it on", () => {
    const holder = document.body.appendChild(document.createElement("div"))
    const pressed = holder.appendChild(document.createElement("span"))
    const cancel = live(holder)
    fire(pressed, "lostpointercapture")
    expect(cancel).not.toHaveBeenCalled()
    fire(holder, "lostpointercapture")
    expect(cancel).toHaveBeenCalledTimes(1)
    holder.remove()
    fire(document, "lostpointercapture")
    expect(cancel).toHaveBeenCalledTimes(2)
  })

  it("ignores a lost capture when the drag holds nothing", () => {
    const pressed = document.body.appendChild(document.createElement("div"))
    const cancel = live()
    fire(pressed, "lostpointercapture")
    expect(cancel).not.toHaveBeenCalled()
  })

  it("listens no more once stopped", () => {
    const holder = document.body.appendChild(document.createElement("div"))
    const cancel = vi.fn()
    onDragCancel(cancel, holder)()
    fire(holder, "pointercancel")
    fire(holder, "lostpointercapture")
    holder.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    expect(cancel).not.toHaveBeenCalled()
  })
})
