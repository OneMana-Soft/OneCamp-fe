import { describe, expect, it } from "vitest"
import { installRangeRects } from "./rangeRects"

// The one opt-in stand-in for a Range's rects in jsdom: installed for a file
// that needs it, and taken back after, never left behind for other tests.

describe("the Range rects stand-in", () => {
  it("gives a Range empty rects while installed, and takes them back", () => {
    const proto = Range.prototype as unknown as Record<string, unknown>
    expect(typeof proto.getClientRects).toBe("undefined")
    const restore = installRangeRects()
    const range = document.createRange()
    expect(range.getClientRects().length).toBe(0)
    expect(Array.from(range.getClientRects())).toEqual([])
    expect(range.getBoundingClientRect()).toMatchObject({ width: 0, height: 0 })
    restore()
    expect(typeof proto.getClientRects).toBe("undefined")
    expect(typeof proto.getBoundingClientRect).toBe("undefined")
  })

  it("gives every range the one box it is given, for a test that places things by the text", () => {
    const restore = installRangeRects({ x: 10, y: 10, width: 50, height: 16 })
    try {
      const range = document.createRange()
      const rects = range.getClientRects()
      expect(rects.length).toBe(1)
      expect(rects.item(0)).toMatchObject({ left: 10, top: 10, right: 60, bottom: 26 })
      expect(Array.from(rects)).toHaveLength(1)
      expect(range.getBoundingClientRect()).toMatchObject({ left: 10, top: 10, width: 50, height: 16 })
    } finally {
      restore()
    }
    expect(typeof (Range.prototype as unknown as Record<string, unknown>).getClientRects).toBe("undefined")
  })

  it("leaves a test's own rects alone, and keeps them after", () => {
    const proto = Range.prototype as unknown as Record<string, unknown>
    const own = () => ({ length: 1 }) as unknown as DOMRectList
    proto.getClientRects = own
    try {
      const restore = installRangeRects()
      expect(proto.getClientRects).toBe(own)
      restore()
      expect(proto.getClientRects).toBe(own)
    } finally {
      delete proto.getClientRects
      delete proto.getBoundingClientRect
    }
  })
})
