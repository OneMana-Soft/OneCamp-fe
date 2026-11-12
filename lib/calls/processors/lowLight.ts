// Low light (meet-09): a dark camera picture brightened on this device,
// before a touch-up or a background (cameraTransformer.ts). It works on the
// frame's own planes, as the camera hands them over (I420 or NV12, or RGB),
// through two lookup tables, with no WebGL: a few milliseconds a frame, so
// it never costs a camera frames where graphics are slow (the frame-cost
// measure: WebGL drawn on the processor delivered 18 of 30 fps there).
//
// The lift is measured from the frame itself (a 32 x 18 sample twice a
// second, by the frame's own clock), eased so it never pumps and settles as
// soon whatever the frame rate (a touch-up costs a slow computer frames),
// lifts shadows a little more than the rest, and has a soft knee so a face
// never clips. It never lowers a brightness. Colour is scaled with the
// light (never more than the gain), so the hue holds.

/** The most low light lifts a picture by. */
export const MAX_GAIN = 2.2
/** The mean brightness low light lifts a dark picture toward. */
const TARGET = 0.42
/** Where the bright end of the picture may be lifted to, short of white. */
const HIGH_LIMIT = 0.95
/** How far the lift eases toward the wanted one each measure. */
const EASE = 0.2
/** How often the lift is measured, in seconds of the frames' own clock. */
const MEASURE_SECONDS = 0.5
/** The longest gap one measure eases over: after a pause the lift moves no faster than over two measures. */
const LONGEST_GAP = 1
const SAMPLE = { width: 32, height: 18 }

/** The pixel formats low light reads and writes; any other frame goes on as it is. */
export type LiftableFormat = "I420" | "I420A" | "NV12" | "RGBA" | "RGBX" | "BGRA" | "BGRX"
const LIFTABLE: readonly string[] = ["I420", "I420A", "NV12", "RGBA", "RGBX", "BGRA", "BGRX"]
const isYuv = (f: LiftableFormat) => f === "I420" || f === "I420A" || f === "NV12"
/** Where red sits in a 4-byte pixel (blue is at 2 minus it). */
const redAt = (f: LiftableFormat) => (f === "BGRA" || f === "BGRX" ? 2 : 0)

/** Luma's black and white codes: video range (16-235) unless the frame says full. */
const lumaRange = (full: boolean) => (full ? { black: 0, white: 255 } : { black: 16, white: 235 })

/** A picture's mean brightness and its bright end (the 90th percentile), from luma samples 0-1. Pure. */
export function lumaStats(ys: ArrayLike<number>): { mean: number; high: number } {
  const n = ys.length
  if (!n) return { mean: 0, high: 0 }
  const sorted = Float64Array.from(ys).sort()
  let sum = 0
  for (let i = 0; i < n; i++) sum += sorted[i]
  return { mean: sum / n, high: sorted[Math.min(n - 1, Math.floor(n * 0.9))] }
}

/** The lift a picture wants: none when bright enough, never past MAX_GAIN, never its bright end past HIGH_LIMIT. Pure. */
export function gainFor({ mean, high }: { mean: number; high: number }): number {
  return Math.max(1, Math.min(MAX_GAIN, mean > 0 ? TARGET / mean : Infinity, high > 0 ? HIGH_LIMIT / high : Infinity))
}

/** The next lift: a fifth of the way toward the wanted one for each half second since the last measure, so it settles as soon at any frame rate. Pure. */
export const easeGain = (current: number, wanted: number, seconds = MEASURE_SECONDS): number =>
  current + (wanted - current) * (1 - Math.pow(1 - EASE, Math.min(seconds, LONGEST_GAP) / MEASURE_SECONDS))

/** One brightness (0-1) lifted by `gain`: shadows a little more, and a soft knee above 0.8 so it never clips, which only slows the lift near white and never takes a brightness below where it was. Pure. */
function lift(y: number, gain: number): number {
  const lifted = Math.pow(y * gain, 1 - 0.15 * Math.min(1, (gain - 1) / 1.2))
  return Math.max(y, lifted < 0.8 ? lifted : 0.8 + 0.2 * (1 - Math.exp(-(lifted - 0.8) / 0.2)))
}

export interface LiftTables {
  /** Each luma code, lifted. */
  y: Uint8Array
  /** A colour-difference code (U or V, about 128) scaled for the luma it sits on: [luma << 8 | code]. */
  chroma: Uint8Array
  /** An RGB channel scaled for its pixel's luma: [luma << 8 | channel]. */
  channel: Uint8Array
}

/** The lookup tables for one gain, in video range or full. Pure. */
export function liftTables(gain: number, full: boolean): LiftTables {
  const { black, white } = lumaRange(full)
  const [cLow, cHigh] = full ? [0, 255] : [16, 240]
  const y = new Uint8Array(256)
  const scale = new Float64Array(256)
  for (let v = 0; v < 256; v++) {
    const y01 = Math.min(1, Math.max(0, (v - black) / (white - black)))
    const lifted = gain > 1 ? lift(y01, gain) : y01
    // A code past white keeps its place: the lift never lowers one.
    y[v] = Math.max(v, Math.round(black + lifted * (white - black)))
    // Colour grows as the light does (the hue holds), never past the gain, so the dark's grain doesn't bloom; black, given no light, keeps its own.
    scale[v] = gain > 1 && y01 > 0 ? Math.min(gain, lifted / y01) : 1
  }
  const chroma = new Uint8Array(65536)
  const channel = new Uint8Array(65536)
  for (let l = 0; l < 256; l++)
    for (let c = 0; c < 256; c++) {
      chroma[(l << 8) | c] = Math.min(cHigh, Math.max(cLow, Math.round(128 + (c - 128) * scale[l])))
      channel[(l << 8) | c] = Math.min(255, Math.round(c * scale[l]))
    }
  return { y, chroma, channel }
}

interface Plane {
  offset: number
  stride: number
}

/** A pixel's luma code from 4-byte RGB, red at `r`. */
const rgbLuma = (d: Uint8Array, i: number, r: number) => (77 * d[i + r] + 150 * d[i + 1] + 29 * d[i + 2 - r] + 128) >> 8

/** Luma samples (0-1) on a 32 x 18 grid of a frame's planes. Pure. */
export function sampleLuma(d: Uint8Array, layout: readonly Plane[], format: LiftableFormat, width: number, height: number, full: boolean): Float64Array {
  const out = new Float64Array(SAMPLE.width * SAMPLE.height)
  const { black, white } = lumaRange(full)
  const [p] = layout
  const r = redAt(format)
  for (let sy = 0; sy < SAMPLE.height; sy++) {
    const row = p.offset + Math.floor(((sy + 0.5) * height) / SAMPLE.height) * p.stride
    for (let sx = 0; sx < SAMPLE.width; sx++) {
      const px = Math.floor(((sx + 0.5) * width) / SAMPLE.width)
      const v = isYuv(format) ? d[row + px] : rgbLuma(d, row + px * 4, r)
      out[sy * SAMPLE.width + sx] = isYuv(format) ? Math.min(1, Math.max(0, (v - black) / (white - black))) : v / 255
    }
  }
  return out
}

/** Lifts a frame's planes in place through `t`. Colour is read against the luma it sits on before that luma is lifted. */
export function liftPlanes(d: Uint8Array, layout: readonly Plane[], format: LiftableFormat, width: number, height: number, t: LiftTables): void {
  const [yp] = layout
  if (!isYuv(format)) {
    const r = redAt(format)
    for (let py = 0; py < height; py++) {
      const row = yp.offset + py * yp.stride
      for (let px = 0; px < width; px++) {
        const i = row + px * 4
        const l = rgbLuma(d, i, r) << 8
        d[i] = t.channel[l | d[i]]
        d[i + 1] = t.channel[l | d[i + 1]]
        d[i + 2] = t.channel[l | d[i + 2]]
      }
    }
    return
  }
  const cw = Math.ceil(width / 2)
  const ch = Math.ceil(height / 2)
  const [, a, b] = layout
  for (let cy = 0; cy < ch; cy++) {
    const lumaRow = yp.offset + Math.min(2 * cy, height - 1) * yp.stride
    const ra = a.offset + cy * a.stride
    if (format === "NV12") {
      for (let cx = 0; cx < cw; cx++) {
        const l = d[lumaRow + Math.min(2 * cx, width - 1)] << 8
        d[ra + 2 * cx] = t.chroma[l | d[ra + 2 * cx]]
        d[ra + 2 * cx + 1] = t.chroma[l | d[ra + 2 * cx + 1]]
      }
    } else {
      const rb = b.offset + cy * b.stride
      for (let cx = 0; cx < cw; cx++) {
        const l = d[lumaRow + Math.min(2 * cx, width - 1)] << 8
        d[ra + cx] = t.chroma[l | d[ra + cx]]
        d[rb + cx] = t.chroma[l | d[rb + cx]]
      }
    }
  }
  for (let py = 0; py < height; py++) {
    const row = yp.offset + py * yp.stride
    for (let px = 0; px < width; px++) d[row + px] = t.y[d[row + px]]
  }
}

export interface LightPass {
  /** The frame lifted, or null when there is nothing to lift or it can't be read (the caller sends the frame as it is). */
  draw(frame: VideoFrame): Promise<VideoFrame | null>
}

/** Low light for one camera: its lift, its tables and one buffer, kept between frames. */
export function makeLightPass(): LightPass {
  let gain = 1
  /** When the lift was last measured, on the frames' own clock (µs), or null before the first. */
  let measuredAt: number | null = null
  let buffer: Uint8Array | null = null
  let tables: LiftTables | null = null
  let tablesFor = ""
  return {
    async draw(frame) {
      const format = frame.format
      if (!format || !LIFTABLE.includes(format)) return null
      const f = format as LiftableFormat
      // Measured by the frames' own clock, not their count, so a touch-up that costs a slow computer frames never slows the lift.
      // A clock that runs back (a new camera) starts again.
      const since = measuredAt !== null && frame.timestamp >= measuredAt ? (frame.timestamp - measuredAt) / 1e6 : null
      const measure = since === null || since >= MEASURE_SECONDS
      // A room bright enough needs no copy at all between two measures.
      if (!measure && gain <= 1.001) return null
      try {
        const width = frame.visibleRect?.width ?? frame.codedWidth
        const height = frame.visibleRect?.height ?? frame.codedHeight
        const size = frame.allocationSize()
        if (!buffer || buffer.length !== size) buffer = new Uint8Array(size)
        const layout = await frame.copyTo(buffer)
        const full = !isYuv(f) || frame.colorSpace?.fullRange === true
        if (measure) {
          gain = easeGain(gain, gainFor(lumaStats(sampleLuma(buffer, layout, f, width, height, full))), since ?? MEASURE_SECONDS)
          measuredAt = frame.timestamp
        }
        if (gain <= 1.001) return null
        const key = `${gain.toFixed(3)} ${full}`
        if (!tables || key !== tablesFor) {
          tables = liftTables(gain, full)
          tablesFor = key
        }
        liftPlanes(buffer, layout, f, width, height, tables)
        return new VideoFrame(buffer, {
          format: f,
          codedWidth: width,
          codedHeight: height,
          layout,
          timestamp: frame.timestamp,
          duration: frame.duration ?? undefined,
          displayWidth: frame.displayWidth,
          displayHeight: frame.displayHeight,
          colorSpace: frame.colorSpace?.toJSON(),
        })
      } catch {
        return null
      }
    },
  }
}
