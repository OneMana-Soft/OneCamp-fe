import { afterEach, describe, expect, it, vi } from "vitest"
import { getMediaDimensions } from "./getMediaDimensions"

// V-1160: a file the browser can't read used to reject, and the upload that
// measured it stopped. It now measures 0 by 0, and the upload goes on.

URL.createObjectURL = vi.fn(() => "blob:file")
URL.revokeObjectURL = vi.fn()

// An element that errors as soon as it has a source, as a broken file does.
const failing = () => {
  const el = { onerror: null as null | (() => void), set src(_: string) { queueMicrotask(() => el.onerror?.()) } }
  return el
}

afterEach(() => vi.restoreAllMocks())

describe("getMediaDimensions", () => {
  it("measures a video the browser can't read as 0 by 0, with no length", async () => {
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "video" ? failing() : createElement(tag)) as typeof document.createElement)
    const clip = new File(["not a video"], "clip.mp4", { type: "video/mp4" })
    await expect(getMediaDimensions(clip)).resolves.toEqual({ width: 0, height: 0, duration: 0 })
  })

  it("measures an image the browser can't read as 0 by 0", async () => {
    vi.stubGlobal("Image", function Image() { return failing() })
    const shot = new File(["not an image"], "shot.png", { type: "image/png" })
    await expect(getMediaDimensions(shot)).resolves.toEqual({ width: 0, height: 0 })
    vi.unstubAllGlobals()
  })
})
