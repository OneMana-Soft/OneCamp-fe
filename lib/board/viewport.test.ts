import { describe, expect, it } from "vitest"
import { followScene, followView, viewAboveSheet, viewCentre } from "@/lib/board/viewport"

describe("viewAboveSheet: what of the board a phone's sheet leaves in view", () => {
  const view = { scrollX: -100, scrollY: -50, zoom: 1, width: 390, height: 780, offsetLeft: 0, offsetTop: 64 }

  it("is the upper half on a phone, whose panels open as half sheets over the lower half", () => {
    const open = viewAboveSheet(view, true)
    expect(open).toEqual({ ...view, height: 390 })
    // Its middle is a quarter of the way down the board: what Add from OneCamp lays a card at.
    expect(viewCentre(open)).toEqual({ x: 100 + 195, y: 50 + 195 })
  })

  it("is the whole board on a computer, whose panels float at its side", () => {
    expect(viewAboveSheet(view, false)).toBe(view)
  })

  it("never changes the view it is given", () => {
    viewAboveSheet(view, true)
    expect(view.height).toBe(780)
  })
})

describe("followScene: the camera that shows a view on this screen", () => {
  const presenter = { scrollX: -100, scrollY: -50, zoom: 1, width: 1280, height: 800 }
  const phone = { width: 390, height: 844 }

  it("is the view fitted to this screen (followView), in the shape Excalidraw's updateScene takes", () => {
    const f = followView(presenter, phone)
    expect(followScene(presenter, { scrollX: 0, scrollY: 0, zoom: 1, ...phone })).toEqual({ scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom } })
  })

  it("is null when this screen shows the view already, within half a pixel and a thousandth of zoom, so nothing is set", () => {
    const f = followView(presenter, phone)
    expect(followScene(presenter, { ...f, ...phone })).toBeNull()
    expect(followScene(presenter, { ...f, scrollX: f.scrollX + 0.4, zoom: f.zoom + 0.0009, ...phone })).toBeNull()
    expect(followScene(presenter, { ...f, scrollX: f.scrollX + 1, ...phone })).not.toBeNull()
    expect(followScene(presenter, { ...f, zoom: f.zoom * 1.01, ...phone })).not.toBeNull()
  })
})
