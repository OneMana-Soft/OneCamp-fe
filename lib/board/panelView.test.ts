import { describe, expect, it } from "vitest"
import { FRAME_NAME_ROOM, boxAllInView, offsetsOf, roomAbove, viewBesidePanel } from "@/lib/board/panelView"
import { boxInView, sceneToLocal, viewAboveSheet } from "@/lib/board/viewport"

describe("offsetsOf: the canvasOffsets that keep scrollToContent inside an open view", () => {
  const whole = { scrollX: 0, scrollY: 0, zoom: 1, width: 1216, height: 812, offsetLeft: 64, offsetTop: 48 }

  it("is the panel's width on the right on a computer, and nothing elsewhere", () => {
    expect(offsetsOf(whole, viewBesidePanel(whole, false, 960))).toEqual({ top: 0, left: 0, right: 320, bottom: 0 })
  })

  it("is the tool row's band on top and the sheet below on a phone", () => {
    const phone = { scrollX: 0, scrollY: 0, zoom: 1, width: 390, height: 694, offsetLeft: 0, offsetTop: 150 }
    expect(offsetsOf(phone, viewBesidePanel(phone, true, 422, 219))).toEqual({ top: 69, left: 0, right: 0, bottom: 422 })
    expect(offsetsOf(phone, phone)).toEqual({ top: 0, left: 0, right: 0, bottom: 0 })
  })

  it("keeps room over the content for what of it is drawn above its box, a frame's name, and moves no other side (V-270)", () => {
    const phone = { scrollX: 0, scrollY: 0, zoom: 1, width: 390, height: 694, offsetLeft: 0, offsetTop: 150 }
    expect(offsetsOf(phone, viewBesidePanel(phone, true, 422, 219), roomAbove({ type: "frame" }))).toEqual({ top: 69 + FRAME_NAME_ROOM, left: 0, right: 0, bottom: 422 })
  })
})

describe("roomAbove: what of an element is drawn above its box", () => {
  it("is a frame's name: Excalidraw 0.18.1's, its foot 3 px over the frame, 14 px words on a 1.25 line, and air (V-270)", () => {
    expect(FRAME_NAME_ROOM).toBe(24)
    expect([roomAbove({ type: "frame" }), roomAbove({ type: "magicframe" })]).toEqual([FRAME_NAME_ROOM, FRAME_NAME_ROOM])
  })

  it("is nothing for a note, a shape, an arrow or words", () => {
    expect(["rectangle", "ellipse", "arrow", "text"].map((type) => roomAbove({ type }))).toEqual([0, 0, 0, 0])
  })
})

describe("viewBesidePanel: what of the board Find's panel leaves in view", () => {
  // A computer's board canvas right of a 64 px rail, Find's panel floating over its right side from x 960.
  const view = { scrollX: 0, scrollY: 0, zoom: 1, width: 1216, height: 812, offsetLeft: 64, offsetTop: 48 }

  it("is the canvas left of the panel on a computer", () => {
    expect(viewBesidePanel(view, false, 960)).toEqual({ ...view, width: 896 })
  })

  it("is the whole canvas before the panel is laid out, and never wider than the canvas or under nothing", () => {
    expect(viewBesidePanel(view, false)).toBe(view)
    expect(viewBesidePanel(view, false, 1400).width).toBe(1216)
    expect(viewBesidePanel(view, false, 10).width).toBe(0)
  })

  // A phone's canvas under the board's header and the demo's note, from y 150 to the foot of an 844 px screen, and
  // Find's half sheet over the screen's lower half, its top at y 422.
  const phone = { scrollX: 0, scrollY: 0, zoom: 1, width: 390, height: 694, offsetLeft: 0, offsetTop: 150 }

  it("is the canvas above the sheet's top on a phone, where the canvas's upper half runs 75 px under the sheet (V-201)", () => {
    expect(viewBesidePanel(phone, true, 422)).toEqual({ ...phone, height: 272 })
    expect(phone.offsetTop + viewAboveSheet(phone, true).height - 422).toBe(75)
  })

  it("starts under the tool row floating over the board's top on a phone, every scene point drawn where it was", () => {
    // The MobileMenu's tool row ends at y 219: what is open runs from there to the sheet's top, 203 px.
    const open = viewBesidePanel(phone, true, 422, 219)
    expect(open).toEqual({ ...phone, offsetTop: 219, height: 203, scrollY: -69 })
    expect(open.offsetTop + sceneToLocal(open, 40, 300).top).toBe(phone.offsetTop + sceneToLocal(phone, 40, 300).top)
    // A row that ends above the canvas's top takes nothing from it.
    expect(viewBesidePanel(phone, true, 422, 100)).toEqual({ ...phone, height: 272 })
  })

  it("is the upper half on a phone before its sheet is laid out (viewAboveSheet), and never taller than the canvas", () => {
    expect(viewBesidePanel(phone, true)).toEqual(viewAboveSheet(phone, true))
    expect(viewBesidePanel(phone, true, 900).height).toBe(694)
  })

  it("is the upper half too where the sheet leaves under a quarter of the canvas above it, as on a phone on its side", () => {
    // 844 x 390 on its side: the canvas from y 52, under the board's header, and a 20rem half sheet from y 70.
    const side = { scrollX: 0, scrollY: 0, zoom: 1, width: 844, height: 338, offsetLeft: 0, offsetTop: 52 }
    expect(viewBesidePanel(side, true, 70)).toEqual(viewAboveSheet(side, true))
    // A sheet over all of the canvas; and the quarter's edge, 173.5 of the 694 px canvas, kept, a pixel less not.
    expect(viewBesidePanel(phone, true, 100)).toEqual(viewAboveSheet(phone, true))
    expect(viewBesidePanel(phone, true, 323.5)).toEqual({ ...phone, height: 173.5 })
    expect(viewBesidePanel(phone, true, 322.5)).toEqual(viewAboveSheet(phone, true))
  })
})

describe("boxAllInView: whether a box on the canvas is all in view", () => {
  const view = { width: 390, height: 780 }

  it("is true inside the view, its edges included", () => {
    expect(boxAllInView(view, 10, 10, 200, 100)).toBe(true)
    expect(boxAllInView(view, 0, 0, 390, 780)).toBe(true)
  })

  it("is false when any side is out, where boxInView, any of it, is still true", () => {
    for (const [l, t, r, b] of [
      [-1, 10, 200, 100],
      [10, -1, 200, 100],
      [10, 10, 391, 100],
      [10, 10, 200, 781],
    ]) {
      expect(boxAllInView(view, l, t, r, b)).toBe(false)
      expect(boxInView(view, l, t, r, b)).toBe(true)
    }
  })

  it("is false for words under a phone's sheet, though they are on the canvas", () => {
    // A note's words at y 600 to 622 on a 780-high board, with the camera at the scene's corner at 100%.
    const camera = { scrollX: 0, scrollY: 0, zoom: 1, width: 390, height: 780, offsetLeft: 0, offsetTop: 0 }
    const tl = sceneToLocal(camera, 140, 600)
    const br = sceneToLocal(camera, 240, 622)
    expect(boxAllInView(camera, tl.left, tl.top, br.left, br.top)).toBe(true)
    expect(boxAllInView(viewAboveSheet(camera, true), tl.left, tl.top, br.left, br.top)).toBe(false)
  })
})
