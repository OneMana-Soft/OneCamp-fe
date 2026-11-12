import { afterEach, describe, expect, it, vi } from "vitest"
import { SKIN } from "./look"
import { MAX_GAIN, easeGain, gainFor, liftPlanes, liftTables, lumaStats, makeLightPass, sampleLuma } from "./lowLight"

// Low light (meet-09): a dark camera picture lifted on this device, on the
// frame's own planes and without WebGL, so it costs a camera a few
// milliseconds a frame. Read without a browser; the picture itself is met by
// e2e/callLook.spec.ts. A face it lifts must stay skin for the touch-up
// that follows it (look.ts's SKIN), whatever its skin tone and its light.

/** One I420 frame, w x h: luma `y` everywhere, colour `u` and `v`. */
function i420(w: number, h: number, y: number, u = 128, v = 128) {
  const cw = Math.ceil(w / 2)
  const ch = Math.ceil(h / 2)
  const d = new Uint8Array(w * h + 2 * cw * ch)
  d.fill(y, 0, w * h)
  d.fill(u, w * h, w * h + cw * ch)
  d.fill(v, w * h + cw * ch)
  return { d, layout: [{ offset: 0, stride: w }, { offset: w * h, stride: cw }, { offset: w * h + cw * ch, stride: cw }] }
}
/** An RGBA (or BGRA) frame, w x h, of one colour. */
const rgba = (w: number, h: number, c: [number, number, number]) => ({ d: new Uint8Array(w * h * 4).map((_, i) => [...c, 255][i % 4]), layout: [{ offset: 0, stride: w * 4 }] })

describe("the light in a frame", () => {
  it("is read as its mean and its bright end", () => {
    expect(lumaStats(new Float64Array(576))).toEqual({ mean: 0, high: 0 })
    const lamp = new Float64Array(576).fill(0.1)
    lamp.fill(0.9, 0, 100)
    const s = lumaStats(lamp)
    expect(s.mean).toBeCloseTo((476 * 0.1 + 100 * 0.9) / 576, 5)
    expect(s.high).toBeCloseTo(0.9, 5)
  })

  it("is read from a camera's own planes, in video range or full, and from RGB with green weighing most", () => {
    const black = i420(64, 36, 16)
    expect(Math.max(...sampleLuma(black.d, black.layout, "I420", 64, 36, false))).toBe(0)
    const white = i420(64, 36, 235)
    expect(Math.min(...sampleLuma(white.d, white.layout, "I420", 64, 36, false))).toBe(1)
    expect(sampleLuma(white.d, white.layout, "I420", 64, 36, true)[0]).toBeCloseTo(235 / 255, 5)
    const green = rgba(64, 36, [0, 200, 0])
    const blue = rgba(64, 36, [0, 0, 200])
    const g = sampleLuma(green.d, green.layout, "RGBA", 64, 36, true)[0]
    const b = sampleLuma(blue.d, blue.layout, "RGBA", 64, 36, true)[0]
    expect(g).toBeGreaterThan(b * 4)
    // In BGRA the red and blue trade places.
    const red = rgba(64, 36, [200, 0, 0])
    expect(sampleLuma(red.d, red.layout, "BGRA", 64, 36, true)[0]).toBeCloseTo(b, 2)
  })
})

describe("low light's lift", () => {
  it("leaves a bright room as it is, lifts a dark one, and stops at its most", () => {
    expect(gainFor({ mean: 0.5, high: 0.8 })).toBe(1)
    const dark = gainFor({ mean: 0.15, high: 0.3 })
    expect(dark).toBeGreaterThan(1.5)
    expect(dark).toBeLessThanOrEqual(MAX_GAIN)
    expect(gainFor({ mean: 0.02, high: 0.05 })).toBe(MAX_GAIN)
    expect(gainFor({ mean: 0, high: 0 })).toBe(MAX_GAIN)
  })

  it("never pushes the bright end of a dark room past white", () => {
    const g = gainFor({ mean: 0.15, high: 0.7 })
    expect(g).toBeGreaterThan(1)
    expect(0.7 * g).toBeLessThanOrEqual(0.95 + 1e-9)
  })

  it("eases toward the wanted lift, so the picture never pumps", () => {
    let g = 1
    const seen: number[] = []
    for (let i = 0; i < 40; i++) {
      g = easeGain(g, 2)
      seen.push(g)
    }
    expect(seen[0]).toBeGreaterThan(1)
    expect(seen[0]).toBeLessThan(1.5)
    // Always toward it, never past it.
    expect(seen.every((v, i) => v <= 2 && (i === 0 || v >= seen[i - 1]))).toBe(true)
    expect(seen[seen.length - 1]).toBeCloseTo(2, 2)
    expect(easeGain(2, 1)).toBeLessThan(2)
  })
})


describe("low light on a camera's planes", () => {
  it("brightens a dark picture, lifts its shadows more than the gain alone, and changes nothing at no gain", () => {
    const f = i420(4, 2, 40)
    liftPlanes(f.d, f.layout, "I420", 4, 2, liftTables(2, false))
    expect(f.d[0]).toBeGreaterThan(16 + (40 - 16) * 2)
    const g = i420(4, 2, 40, 100, 160)
    const before = g.d.slice()
    liftPlanes(g.d, g.layout, "I420", 4, 2, liftTables(1, false))
    expect(g.d).toEqual(before)
  })

  it("keeps the hue: colour grows with the light, never past the gain, and grey stays grey", () => {
    const t = liftTables(2, false)
    const skin = i420(4, 2, 60, 112, 152)
    liftPlanes(skin.d, skin.layout, "I420", 4, 2, t)
    const [u, v] = [skin.d[8], skin.d[10]]
    expect(128 - u).toBeGreaterThan(16)
    expect(128 - u).toBeLessThanOrEqual(16 * 2)
    expect((v - 128) / (128 - u)).toBeCloseTo(24 / 16, 1)
    const grey = i420(4, 2, 60)
    liftPlanes(grey.d, grey.layout, "I420", 4, 2, t)
    expect([grey.d[8], grey.d[10]]).toEqual([128, 128])
  })

  it("never clips: the brightest stays inside the picture's range", () => {
    const video = i420(4, 2, 235, 16, 240)
    liftPlanes(video.d, video.layout, "I420", 4, 2, liftTables(MAX_GAIN, false))
    expect(video.d[0]).toBeLessThanOrEqual(235)
    expect([video.d[8], video.d[10]]).toEqual([16, 240])
    const full = i420(4, 2, 250)
    liftPlanes(full.d, full.layout, "I420", 4, 2, liftTables(MAX_GAIN, true))
    expect(full.d[0]).toBeLessThanOrEqual(255)
    expect(full.d[0]).toBeGreaterThanOrEqual(250)
  })

  it("lifts NV12's interleaved colour as I420's, and RGB's channels with the hue kept", () => {
    const t = liftTables(2, false)
    const nv12 = new Uint8Array(4 * 2 + 4).fill(60, 0, 8)
    for (let i = 0; i < 2; i++) nv12.set([112, 152], 8 + 2 * i)
    liftPlanes(nv12, [{ offset: 0, stride: 4 }, { offset: 8, stride: 4 }], "NV12", 4, 2, t)
    const ref = i420(4, 2, 60, 112, 152)
    liftPlanes(ref.d, ref.layout, "I420", 4, 2, t)
    expect([nv12[0], nv12[8], nv12[9]]).toEqual([ref.d[0], ref.d[8], ref.d[10]])
    const warm = rgba(1, 1, [60, 40, 30])
    liftPlanes(warm.d, warm.layout, "RGBA", 1, 1, liftTables(2, true))
    expect(warm.d[0]).toBeGreaterThan(60 * 1.5)
    expect(warm.d[0] / warm.d[2]).toBeCloseTo(2, 1)
    expect(warm.d[3]).toBe(255)
  })
})

/** A colour (sRGB, 0-255) as a camera's video-range BT.601 codes. */
function cameraCodes([r, g, b]: readonly number[]): [number, number, number] {
  const code = (x: number) => Math.min(255, Math.max(0, Math.round(x)))
  return [code(16 + (65.481 * r + 128.553 * g + 24.966 * b) / 255), code(128 + (-37.797 * r - 74.203 * g + 112 * b) / 255), code(128 + (112 * r - 93.786 * g - 18.214 * b) / 255)]
}
/** Video-range codes as the browser draws them for the touch-up: RGB, 0-1. */
function drawn(y: number, u: number, v: number): number[] {
  const l = 1.164 * (y - 16)
  return [l + 1.596 * (v - 128), l - 0.392 * (u - 128) - 0.813 * (v - 128), l + 2.017 * (u - 128)].map((x) => Math.min(1, Math.max(0, x / 255)))
}
/** Where a drawn colour sits for the touch-up's SKIN (look.ts): its hue in degrees, its colour for its light, its luma. */
function skinPlace([r, g, b]: number[]) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b
  return { hue: (Math.atan2(cr, cb) * 180) / Math.PI, colour: Math.hypot(cb, cr) / Math.max(luma, 0.001), luma }
}
/** A colour lit at `light` (1: as bright as itself), as the camera sends it, lifted by low light at `gain`, where the touch-up sees it. */
function liftedPlace(colour: readonly number[], light: number, gain: number) {
  const f = i420(2, 2, ...cameraCodes(colour.map((c) => c * light)))
  liftPlanes(f.d, f.layout, "I420", 2, 2, liftTables(gain, false))
  return skinPlace(drawn(f.d[0], f.d[4], f.d[5]))
}
const GAINS = Array.from({ length: 13 }, (_, i) => 1 + i / 10)
/**
 * Each lift a colour meets, at every gain: in a room as dark as the gain
 * makes up for (lifted back to itself), and lit as brightly as itself, the
 * brightest thing in a dark room (lifted past itself, as far as low light
 * lifts a picture's bright end).
 */
function lifts(colour: readonly number[]) {
  const own = (cameraCodes(colour)[0] - 16) / 219
  return GAINS.flatMap((gain) => [
    { gain, light: 1 / gain },
    { gain: Math.min(gain, gainFor({ mean: 0, high: own })), light: 1 },
  ])
}
/** The Monk Skin Tone scale's ten swatches (skintone.google), lightest to darkest, and two under a warm lamp (red kept, blue down). */
const SKIN_TONES: Record<string, readonly number[]> = {
  "MST 1": [0xf6, 0xed, 0xe4],
  "MST 2": [0xf3, 0xe7, 0xdb],
  "MST 3": [0xf7, 0xea, 0xd0],
  "MST 4": [0xea, 0xda, 0xba],
  "MST 5": [0xd7, 0xbd, 0x96],
  "MST 6": [0xa0, 0x7e, 0x56],
  "MST 7": [0x82, 0x5c, 0x43],
  "MST 8": [0x60, 0x41, 0x34],
  "MST 9": [0x3a, 0x31, 0x2a],
  "MST 10": [0x29, 0x24, 0x20],
  "MST 5 under a warm lamp": [0xd7, 0xbd * 0.8, 0x96 * 0.55],
  "MST 8 under a strong warm lamp (e2e/callLook's face)": [0x60, 0x41 * 0.7, 0x34 * 0.4],
}
const NOT_SKIN: Record<string, readonly number[]> = {
  grey: [128, 128, 128],
  "a dim blue-grey room": [24, 33, 47],
  "a blue shirt": [40, 60, 140],
  "a green plant": [50, 120, 40],
  "a red shirt": [200, 30, 40],
  "a yellow wall": [220, 200, 40],
}

describe("a face low light lifts, for the touch-up", () => {
  it("is skin at every lift, for every skin tone from the lightest to the darkest, and under a warm lamp", () => {
    const missed: string[] = []
    for (const [name, tone] of Object.entries(SKIN_TONES))
      for (const { gain, light } of lifts(tone)) {
        const p = liftedPlace(tone, light, gain)
        if (p.hue < SKIN.hue[1] || p.hue > SKIN.hue[2] || p.colour < SKIN.colour[1] || p.luma < SKIN.luma[1])
          missed.push(`${name}, lit ${light.toFixed(2)}, lifted ${gain.toFixed(1)}: hue ${p.hue.toFixed(1)}, colour ${p.colour.toFixed(3)}, luma ${p.luma.toFixed(3)}`)
      }
    expect(missed).toEqual([])
  })

  it("never reads a grey, blue, green, red or yellow as skin, at any lift", () => {
    const taken: string[] = []
    for (const [name, colour] of Object.entries(NOT_SKIN))
      for (const { gain, light } of lifts(colour)) {
        const p = liftedPlace(colour, light, gain)
        if (p.colour >= SKIN.colour[1] && p.hue >= SKIN.hue[1] && p.hue <= SKIN.hue[2]) taken.push(`${name}, lit ${light.toFixed(2)}, lifted ${gain.toFixed(1)}: hue ${p.hue.toFixed(1)}`)
      }
    expect(taken).toEqual([])
  })
})

/** The luma (0-255) and Cr a camera's video-range codes are drawn with. */
function seenAs(y: number, u: number, v: number) {
  const [r, g, b] = drawn(y, u, v).map((c) => c * 255)
  return { y: 0.299 * r + 0.587 * g + 0.114 * b, cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b }
}
/** Within 3% of `want`, or a level of it in the dark (under 20), where a percentage is less than a level. */
const near = (got: number, want: number) => Math.abs(got - want) <= Math.max(want * 0.03, want < 20 ? 1 : 0)

describe("a face low light lifts, as bright as the room's lift", () => {
  it("is lifted by a dim room's gain whatever its skin tone, the darkest as the lightest, and never darker than it came", () => {
    // In a room as dark as the lift makes up for, a face is lifted by the gain (shadows a little more). Lit as itself, it is
    // the room's bright end, which the soft knee holds short of white (and a warm face's red stops at white): never darker.
    const short: string[] = []
    for (const [name, tone] of Object.entries(SKIN_TONES))
      for (const { gain, light } of lifts(tone)) {
        const codes = cameraCodes(tone.map((c) => c * light))
        const source = seenAs(...codes).y
        const f = i420(2, 2, ...codes)
        liftPlanes(f.d, f.layout, "I420", 2, 2, liftTables(gain, false))
        const lifted = seenAs(f.d[0], f.d[4], f.d[5]).y
        if (lifted < source || (light < 1 && lifted < 0.9 * source * gain))
          short.push(`${name}, lit ${light.toFixed(2)}, lifted ${gain.toFixed(1)}: ${source.toFixed(1)} -> ${lifted.toFixed(1)}, wanted ${(source * gain).toFixed(1)}`)
      }
    expect(short).toEqual([])
  })

  it("never lowers a brightness, at any lift, in video range or full: the soft knee only slows the lift near white", () => {
    const lowered: string[] = []
    for (const full of [false, true])
      for (const gain of GAINS) {
        const t = liftTables(gain, full)
        for (let v = 0; v < 256; v++) if (t.y[v] < v) lowered.push(`${full ? "full" : "video"} range, lifted ${gain.toFixed(1)}: ${v} -> ${t.y[v]}`)
      }
    expect(lowered.slice(0, 8)).toEqual([])
  })
})

/** A camera frame for makeLightPass: I420, a room at `room` with a face of video-range `face` codes in its middle. */
function cameraFrame(w: number, h: number, room: number, face: [number, number, number], timestamp: number) {
  const f = i420(w, h, room)
  const cw = Math.ceil(w / 2)
  for (let y = h / 2 - 2; y < h / 2 + 2; y++)
    for (let x = w / 2 - 2; x < w / 2 + 2; x++) {
      f.d[y * w + x] = face[0]
      f.d[w * h + (y >> 1) * cw + (x >> 1)] = face[1]
      f.d[w * h + cw * Math.ceil(h / 2) + (y >> 1) * cw + (x >> 1)] = face[2]
    }
  const colorSpace = { fullRange: false, matrix: "smpte170m", primaries: "smpte170m", transfer: "smpte170m" }
  return {
    format: "I420",
    codedWidth: w,
    codedHeight: h,
    visibleRect: { width: w, height: h },
    displayWidth: w,
    displayHeight: h,
    timestamp,
    duration: null,
    colorSpace: { ...colorSpace, toJSON: () => colorSpace },
    allocationSize: () => f.d.length,
    copyTo: async (into: Uint8Array) => {
      into.set(f.d)
      return f.layout
    },
  } as unknown as VideoFrame
}

describe("a face low light lifts, with a touch-up on", () => {
  // What a lifted frame is made into (jsdom has no VideoFrame): its planes, as low light wrote them.
  class Lifted {
    data: Uint8Array
    constructor(data: Uint8Array) {
      this.data = data.slice()
    }
    close() {}
  }
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** The face as drawn after `seconds` of a camera at `fps` through low light: the room dark enough to want `gain`. */
  async function faceAfter(seconds: number, fps: number, gain: number, face: [number, number, number]) {
    vi.stubGlobal("VideoFrame", Lifted)
    const pass = makeLightPass()
    const w = 64
    const h = 36
    const room = Math.round(16 + (219 * 0.42) / gain)
    let codes = face
    for (let i = 0; i <= seconds * fps; i++) {
      const out = (await pass.draw(cameraFrame(w, h, room, face, Math.round((i * 1e6) / fps)))) as unknown as Lifted | null
      const at = (w * h) / 2 + w / 2
      const cw = w / 2
      const c = (h / 2 / 2) * cw + w / 2 / 2
      if (out) codes = [out.data[at], out.data[w * h + c], out.data[w * h + cw * (h / 2) + c]]
      else codes = face
    }
    return seenAs(...codes)
  }

  it("is as bright as with low light alone, at every lift and skin tone, though a touch-up costs a slow computer frames", async () => {
    // Low light alone: a camera's 30 frames a second. A touch-up drawn where graphics are slow: 7 (the Monk shots' 6.6-6.9).
    // 9 s: the Monk shots' settle. Each skin tone in a room as dark as the lift makes up for.
    const apart: string[] = []
    for (const [name, tone] of Object.entries(SKIN_TONES))
      for (const gain of GAINS) {
        const face = cameraCodes(tone.map((c) => c / gain))
        const alone = await faceAfter(9, 30, gain, face)
        const touched = await faceAfter(9, 7, gain, face)
        if (!near(touched.y, alone.y) || (name.includes("warm") && Math.abs(touched.cr - alone.cr) > 2))
          apart.push(`${name}, lifted ${gain.toFixed(1)}: Y ${alone.y.toFixed(1)} alone, ${touched.y.toFixed(1)} touched up; Cr ${alone.cr.toFixed(1)}, ${touched.cr.toFixed(1)}`)
      }
    expect(apart).toEqual([])
  })
})
