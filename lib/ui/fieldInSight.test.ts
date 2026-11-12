import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FIELD_ROOM_PX, fieldInSightRef, keepFieldInSight, revealBy } from "./fieldInSight"

// A sheet standing on the keyboard is shorter, and the field being typed in is
// scrolled up into what shows of it, as an app's sheet does (the phone pair).

describe("revealBy", () => {
  const box = { top: 100, bottom: 500 }
  it("is nothing for a field that shows whole, its room clear of the edges", () => {
    expect(revealBy({ top: 200, bottom: 240 }, box)).toBe(0)
    expect(revealBy({ top: 100 + FIELD_ROOM_PX, bottom: 500 - FIELD_ROOM_PX }, box)).toBe(0)
  })
  it("scrolls a field below the foot up, its room clear, and one above down", () => {
    expect(revealBy({ top: 520, bottom: 560 }, box)).toBe(560 + FIELD_ROOM_PX - 500)
    expect(revealBy({ top: 60, bottom: 100 }, box)).toBe(60 - FIELD_ROOM_PX - 100)
  })
  it("keeps the top of a field taller than the box in sight", () => {
    expect(revealBy({ top: 300, bottom: 900 }, box)).toBe(300 - FIELD_ROOM_PX - 100)
    expect(revealBy({ top: 50, bottom: 900 }, box)).toBe(50 - FIELD_ROOM_PX - 100)
  })
})

describe("keepFieldInSight", () => {
  let resize: () => void
  let scroller: HTMLDivElement
  let field: HTMLInputElement
  let height: number
  const rect = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 390, width: 390, height: h, x: 0, y: top, toJSON: () => ({}) })
  beforeEach(() => {
    // A ResizeObserver whose callback is called by hand, and no longer once it is disconnected.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        on = false
        constructor(cb: () => void) {
          resize = () => this.on && cb()
        }
        observe() {
          this.on = true
          resize()
        }
        disconnect() {
          this.on = false
        }
      },
    )
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => (cb(0), 0))
    scroller = document.createElement("div")
    field = document.createElement("input")
    scroller.append(field)
    document.body.append(scroller)
    height = 700
    Object.defineProperty(scroller, "clientHeight", { get: () => height })
    scroller.getBoundingClientRect = () => rect(60, height) as DOMRect
    // The field sits at 600 in the scroller's content, less what it has scrolled.
    field.getBoundingClientRect = () => rect(60 + 600 - scroller.scrollTop, 40) as DOMRect
  })
  afterEach(() => {
    scroller.remove()
    document.documentElement.removeAttribute("data-keyboard")
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("scrolls the focused field up over the keyboard as the sheet gets shorter, and nothing more", () => {
    const stop = keepFieldInSight(scroller)
    field.focus()
    document.documentElement.setAttribute("data-keyboard", "open")
    height = 400
    resize()
    // Its bottom (60 + 640) shows, FIELD_ROOM_PX clear of the foot (60 + 400).
    expect(scroller.scrollTop).toBe(640 + FIELD_ROOM_PX - 400)
    const at = scroller.scrollTop
    resize()
    expect(scroller.scrollTop, "the same height is no new shrink").toBe(at)
    stop()
  })

  it("leaves the scroller alone with the keyboard down, a field elsewhere, or once stopped", () => {
    const stop = keepFieldInSight(scroller)
    field.focus()
    height = 400
    resize()
    expect(scroller.scrollTop, "no keyboard: a computer's narrow window").toBe(0)
    document.documentElement.setAttribute("data-keyboard", "open")
    field.blur()
    height = 380
    resize()
    expect(scroller.scrollTop, "nothing of its own focused").toBe(0)
    stop()
    field.focus()
    height = 360
    resize()
    expect(scroller.scrollTop, "stopped").toBe(0)
  })

  it("brings in a field taking focus with the keyboard up, and as the keyboard's fit is written", async () => {
    height = 400
    const stop = keepFieldInSight(scroller)
    document.documentElement.setAttribute("data-keyboard", "open")
    field.focus()
    expect(scroller.scrollTop).toBe(640 + FIELD_ROOM_PX - 400)
    scroller.scrollTop = 0
    document.documentElement.removeAttribute("data-keyboard")
    await Promise.resolve()
    document.documentElement.setAttribute("data-keyboard", "open")
    await Promise.resolve()
    expect(scroller.scrollTop, "the fit written").toBe(640 + FIELD_ROOM_PX - 400)
    stop()
  })

  it("scrolls on from where a long record was scrolled to, not from its top", () => {
    const stop = keepFieldInSight(scroller)
    scroller.scrollTop = 100
    field.focus()
    document.documentElement.setAttribute("data-keyboard", "open")
    height = 400
    resize()
    // The field's place in the content is the same: it ends where it would from the top.
    expect(scroller.scrollTop).toBe(640 + FIELD_ROOM_PX - 400)
    stop()
  })

  it("hears no keyboard's fit written once stopped (a row's body gone, or the sheet)", async () => {
    height = 400
    const stop = keepFieldInSight(scroller)
    field.focus()
    expect(scroller.scrollTop, "the keyboard down").toBe(0)
    stop()
    document.documentElement.setAttribute("data-keyboard", "open")
    await Promise.resolve()
    expect(scroller.scrollTop, "a fit written after the stop").toBe(0)
  })

  it("follows the sheet's or the dialog's body a surface's box is in, from the box's ref; outside one, nothing", () => {
    const box = document.createElement("div")
    box.append(field)
    scroller.append(box)
    expect(fieldInSightRef(box), "no body around it").toBeUndefined()
    for (const mark of ["data-sheet-body", "data-overlay-body"]) {
      scroller.setAttribute(mark, "")
      height = 700
      scroller.scrollTop = 0
      const stop = fieldInSightRef(box)!
      field.focus()
      document.documentElement.setAttribute("data-keyboard", "open")
      height = 400
      resize()
      expect(scroller.scrollTop, mark).toBe(640 + FIELD_ROOM_PX - 400)
      stop()
      field.blur()
      document.documentElement.removeAttribute("data-keyboard")
      scroller.removeAttribute(mark)
    }
  })

  it("keeps a field focused before it starts in sight at once: loaded late, the keyboard is up already", () => {
    height = 400
    document.documentElement.setAttribute("data-keyboard", "open")
    field.focus()
    const stop = keepFieldInSight(scroller)
    expect(scroller.scrollTop).toBe(640 + FIELD_ROOM_PX - 400)
    stop()
  })
})
