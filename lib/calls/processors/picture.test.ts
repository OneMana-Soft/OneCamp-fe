import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { forgetPicture, keepPicture, readPicture } from "./picture"

// A picture to put behind someone, kept on this device: their own, and a
// scene made from their words (meet-09), each in a slot of its own, so
// making a scene never loses the picture they chose, nor the other way round.

const OWN = "onecamp.call.picture"
const SCENE = "onecamp.call.scene"

/** The browser's drawing, faked: every picture comes out as `drawn`. */
let drawn = "data:image/jpeg;base64,AAAA"
beforeEach(() => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1280, height: 720, close: () => undefined })))
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: () => undefined } as never)
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => drawn)
})
afterEach(() => {
  forgetPicture("own")
  forgetPicture("scene")
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const jpeg = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" })

describe("the pictures kept for calls", () => {
  it("keeps a scene apart from one's own picture, and leaves the own picture where it was", async () => {
    drawn = "data:image/jpeg;base64,OWN"
    await keepPicture(jpeg("me.jpg"))
    drawn = "data:image/jpeg;base64,SCENE"
    const kept = await keepPicture(jpeg("scene.jpg"), "scene")
    expect(kept).toEqual({ url: "data:image/jpeg;base64,SCENE", remembered: true })
    expect(window.localStorage.getItem(SCENE)).toBe("data:image/jpeg;base64,SCENE")
    expect(window.localStorage.getItem(OWN)).toBe("data:image/jpeg;base64,OWN")
    expect(readPicture("scene")).toBe("data:image/jpeg;base64,SCENE")
    expect(readPicture()).toBe("data:image/jpeg;base64,OWN")
    expect(readPicture("own")).toBe("data:image/jpeg;base64,OWN")
  })

  it("forgets one and keeps the other", async () => {
    window.localStorage.setItem(OWN, "data:image/jpeg;base64,OWN")
    window.localStorage.setItem(SCENE, "data:image/jpeg;base64,SCENE")
    forgetPicture("scene")
    expect(readPicture("scene")).toBeNull()
    expect(window.localStorage.getItem(SCENE)).toBeNull()
    expect(readPicture()).toBe("data:image/jpeg;base64,OWN")
    forgetPicture()
    expect(readPicture()).toBeNull()
  })

  it("reads only a picture from storage, and keeps a scene too large to store for this page only", async () => {
    window.localStorage.setItem(SCENE, "javascript:alert(1)")
    expect(readPicture("scene")).toBeNull()
    drawn = `data:image/jpeg;base64,${"A".repeat(1_500_001)}`
    const kept = await keepPicture(jpeg("scene.jpg"), "scene")
    expect(kept.remembered).toBe(false)
    expect(window.localStorage.getItem(SCENE)).toBeNull()
    expect(readPicture("scene")).toBe(drawn)
    expect(readPicture()).toBeNull()
  })
})
