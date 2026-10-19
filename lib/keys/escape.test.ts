import { afterEach, describe, expect, it, vi } from "vitest"

import { listenForEscape, type EscapeLayer, type HandedOn } from "./escape"
import { onEscape } from "./onEscape"

// One press, one thing, the innermost first (interaction spec, rule 7), and
// the press marked used so nothing after it acts as well. The one Escape is
// started for every test (vitest.setup.ts), as the root providers start it.

const offs: Array<() => void> = []
const on = (layer: EscapeLayer, handler: (e: KeyboardEvent) => boolean | void) => {
  offs.push(onEscape(layer, handler))
}
afterEach(() => {
  offs.splice(0).forEach((off) => off())
  document.body.innerHTML = ""
})

/** Esc, pressed on `target` (the body by default), as the browser sends it. */
function press(target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

describe("the one Escape", () => {
  it("goes to one handler, by layer: a drag, then what's over the page, a panel, the page, a toast", () => {
    const got: string[] = []
    for (const layer of ["toast", "page", "panel", "overlay", "drag"] as const) on(layer, () => void got.push(layer))
    const order: string[] = []
    for (let i = 0; i < 5; i++) {
      got.length = 0
      press()
      order.push(got.join())
      offs.pop()?.()
    }
    // Each press, one layer; with the innermost gone, the next.
    expect(order).toEqual(["drag", "overlay", "panel", "page", "toast"])
  })

  it("marks the press it used, and a handler that answers false passes it on", () => {
    const panel = vi.fn(() => false)
    const page = vi.fn()
    on("page", page)
    on("panel", panel)
    const e = press()
    expect(panel).toHaveBeenCalledTimes(1)
    expect(page).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it("leaves a press alone that nothing used", () => {
    on("panel", () => false)
    expect(press().defaultPrevented).toBe(false)
  })

  it("tries the newest handler in a layer first", () => {
    const got: string[] = []
    on("overlay", () => void got.push("older"))
    on("overlay", () => void got.push("newer"))
    press()
    expect(got).toEqual(["newer"])
  })

  it("leaves a press a layer took, or that has a menu or a dialog open, to that layer", () => {
    const panel = vi.fn()
    on("panel", panel)
    // A Radix layer took it in the document: marked.
    document.addEventListener("keydown", (e) => e.preventDefault(), { once: true })
    press()
    document.body.innerHTML = '<div role="menu"></div>'
    press()
    document.body.innerHTML = '<div data-radix-popper-content-wrapper><div role="tooltip">Send</div></div>'
    press()
    // A tooltip is no layer: that press is the panel's.
    expect(panel).toHaveBeenCalledTimes(1)
  })

  it("doesn't count a surface that answers Escape here as a layer over itself", () => {
    const close = vi.fn()
    on("overlay", close)
    document.body.innerHTML = '<div role="dialog" data-escape-own=""></div>'
    press()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("lets a press a sheet handed on reach the panel, then counts it used", () => {
    const close = vi.fn()
    on("panel", close)
    const toast = vi.fn()
    on("toast", toast)
    // As components/ui/overlaySheet does: Radix leaves the sheet open, and the press goes on.
    document.addEventListener(
      "keydown",
      (e: KeyboardEvent & HandedOn) => {
        e.escapeHandedOn = true
        e.preventDefault()
      },
      { once: true },
    )
    const e = press()
    expect(close).toHaveBeenCalledTimes(1)
    expect(toast).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(true)
  })

  it("doesn't count a tooltip closing on a press: the press goes on to the page", () => {
    const page = vi.fn()
    on("page", page)
    // A tooltip showing, which Radix closes on Escape and marks the key for.
    document.body.innerHTML = '<div data-radix-popper-content-wrapper><div role="tooltip">Here now</div></div>'
    document.addEventListener(
      "keydown",
      (e: KeyboardEvent & HandedOn) => {
        // As components/ui/tooltip does, before Radix closes it.
        e.escapeHandedOn = true
        e.preventDefault()
      },
      { once: true },
    )
    const e = press()
    expect(page).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it("takes a drag's press before the document hears it, and stops it there", () => {
    const cancel = vi.fn()
    on("drag", cancel)
    const heard = vi.fn()
    document.addEventListener("keydown", heard)
    try {
      const e = press()
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(heard).not.toHaveBeenCalled()
      expect(e.defaultPrevented).toBe(true)
    } finally {
      document.removeEventListener("keydown", heard)
    }
  })

  it("leaves an input method's Escape to it, and other keys alone", () => {
    const close = vi.fn()
    on("overlay", close)
    on("drag", close)
    press(document.body, { isComposing: true })
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    expect(close).not.toHaveBeenCalled()
  })

  it("stops answering once the handler is taken off", () => {
    const close = vi.fn()
    const off = onEscape("overlay", close)
    off()
    press()
    expect(close).not.toHaveBeenCalled()
  })

  it("hears a press once for each time it was started, and not once stopped", () => {
    const close = vi.fn(() => false)
    on("overlay", close)
    const stop = listenForEscape()
    press()
    expect(close).toHaveBeenCalledTimes(2)
    stop()
    press()
    expect(close).toHaveBeenCalledTimes(3)
  })
})


// What answers Escape itself (data-escape-own: a rename put back, a search
// cleared) takes the press: the one Escape leaves it to it, and the page's
// layers hear none of it. A dialog of the app's own marked so (a zoomed image,
// the rail's peek, a table's record) answers it here, in its layer.
describe("what answers Escape itself", () => {
  it("takes the press: the page's layers and the toast hear none of it", () => {
    const page = vi.fn(() => true)
    const toast = vi.fn(() => true)
    on("page", page)
    on("toast", toast)
    document.body.innerHTML = '<label><input data-escape-own="" /></label>'
    press(document.querySelector("input")!)
    expect(page).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it("takes it from inside it too, and a field that doesn't say so passes it on", () => {
    const page = vi.fn(() => true)
    on("page", page)
    document.body.innerHTML = '<div data-escape-own=""><button>Stop</button></div><input id="plain" />'
    press(document.querySelector("button")!)
    expect(page).not.toHaveBeenCalled()
    press(document.getElementById("plain")!)
    expect(page).toHaveBeenCalledTimes(1)
  })

  it("is used before the document, where every Radix layer hears it, so a layer round it stays", () => {
    document.body.innerHTML = '<input data-escape-own="" /><input id="plain" />'
    const seen: boolean[] = []
    const radix = (e: KeyboardEvent) => void seen.push(e.defaultPrevented)
    document.addEventListener("keydown", radix, true)
    try {
      press(document.querySelector("input")!)
      press(document.getElementById("plain")!)
    } finally {
      document.removeEventListener("keydown", radix, true)
    }
    expect(seen).toEqual([true, false])
  })

  it("is heard in its layer when it is a dialog of the app's own", () => {
    const panel = vi.fn(() => true)
    on("panel", panel)
    document.body.innerHTML = '<aside role="dialog" data-escape-own=""><button>Close</button></aside>'
    press(document.querySelector("button")!)
    expect(panel).toHaveBeenCalledTimes(1)
  })
})
