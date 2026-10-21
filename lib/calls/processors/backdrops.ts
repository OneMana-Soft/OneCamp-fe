// The built-in backdrops, drawn here in the camp palette rather than shipped
// as pictures: nothing to license, nothing to download, and each one quiet
// enough that the person in front of it stays what people look at. Drawn once
// per id, on first use, into an image the background processor reads.

import { BACKDROP_SIZE, type BackdropId } from "./effects"

/** The 2D drawing a backdrop needs: a canvas's or an offscreen canvas's. */
export type Paint2D = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "globalAlpha" | "fillRect" | "beginPath" | "moveTo" | "lineTo" | "bezierCurveTo" | "arc" | "ellipse" | "closePath" | "fill" | "createLinearGradient" | "createRadialGradient"
>

/** The camp hues the backdrops are drawn in (app/globals.css, light). */
export const BACKDROP_INKS: Record<BackdropId, { tint: string; base: string; deep: string; glow: string }> = {
  moss: { tint: "#E6F6EC", base: "#2F9E5B", deep: "#1D6A3C", glow: "#FFF6D6" },
  sun: { tint: "#FFF6D6", base: "#B98200", deep: "#7A5200", glow: "#FCE8EF" },
  lake: { tint: "#E1F5F6", base: "#0E97A6", deep: "#0B5C65", glow: "#E7EFFC" },
  sky: { tint: "#E7EFFC", base: "#3B7DDD", deep: "#1E4E9A", glow: "#FFFFFF" },
  dusk: { tint: "#EFEBFC", base: "#7B61D9", deep: "#4B3699", glow: "#FCE8EF" },
  berry: { tint: "#FCE8EF", base: "#D9467C", deep: "#962556", glow: "#FFF6D6" },
}

const { width: W, height: H } = BACKDROP_SIZE

function sky(g: Paint2D, top: string, bottom: string): void {
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, top)
  grad.addColorStop(1, bottom)
  g.fillStyle = grad
  g.globalAlpha = 1
  g.fillRect(0, 0, W, H)
}

/** A soft round light: a radial gradient fading to nothing. */
function glow(g: Paint2D, x: number, y: number, r: number, colour: string, alpha: number): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, colour)
  grad.addColorStop(1, `${colour}00`)
  g.fillStyle = grad
  g.globalAlpha = alpha
  g.fillRect(x - r, y - r, r * 2, r * 2)
}

/** A rolling band from one side to the other, filled down to the bottom. */
function hill(g: Paint2D, y: number, rise: number, colour: string, alpha: number, phase = 0): void {
  g.beginPath()
  g.moveTo(0, y)
  g.bezierCurveTo(W * (0.25 + phase), y - rise, W * (0.5 + phase), y + rise, W, y - rise * 0.4)
  g.lineTo(W, H)
  g.lineTo(0, H)
  g.closePath()
  g.fillStyle = colour
  g.globalAlpha = alpha
  g.fill()
}

const PAINT: Record<BackdropId, (g: Paint2D) => void> = {
  // Meadow: morning light over rolling green.
  moss: (g) => {
    const c = BACKDROP_INKS.moss
    sky(g, "#FFFFFF", c.tint)
    glow(g, W * 0.78, H * 0.26, 260, c.glow, 0.9)
    hill(g, H * 0.62, 60, c.base, 0.18, 0.05)
    hill(g, H * 0.72, 50, c.base, 0.26, -0.08)
    hill(g, H * 0.84, 40, c.deep, 0.22, 0.1)
  },
  // Sunrise: a low sun in warm bands.
  sun: (g) => {
    const c = BACKDROP_INKS.sun
    sky(g, c.glow, c.tint)
    glow(g, W * 0.5, H * 0.78, 420, "#FFD27A", 0.75)
    hill(g, H * 0.8, 24, c.base, 0.16)
    hill(g, H * 0.9, 18, c.deep, 0.14, 0.12)
  },
  // Lagoon: still water under a pale sky.
  lake: (g) => {
    const c = BACKDROP_INKS.lake
    sky(g, c.glow, c.tint)
    glow(g, W * 0.22, H * 0.3, 280, "#FFFFFF", 0.85)
    hill(g, H * 0.66, 18, c.base, 0.16, 0.08)
    hill(g, H * 0.76, 22, c.base, 0.2, -0.06)
    hill(g, H * 0.88, 16, c.deep, 0.2, 0.04)
  },
  // Open sky: clouds drifting high.
  sky: (g) => {
    const c = BACKDROP_INKS.sky
    sky(g, "#CFE0FA", c.tint)
    for (const [x, y, r] of [[0.18, 0.3, 150], [0.32, 0.26, 120], [0.72, 0.42, 170], [0.86, 0.38, 120], [0.5, 0.7, 210]] as const) {
      glow(g, W * x, H * y, r, c.glow, 0.9)
    }
  },
  // Dusk: the evening's last light, a few stars.
  dusk: (g) => {
    const c = BACKDROP_INKS.dusk
    sky(g, "#D9D0F7", c.glow)
    glow(g, W * 0.3, H * 0.85, 380, "#FFFFFF", 0.55)
    g.fillStyle = "#FFFFFF"
    for (const [x, y, r] of [[0.12, 0.16, 2.2], [0.27, 0.09, 1.6], [0.61, 0.13, 2], [0.78, 0.22, 1.4], [0.9, 0.1, 1.8], [0.45, 0.2, 1.2]] as const) {
      g.globalAlpha = 0.85
      g.beginPath()
      g.arc(W * x, H * y, r, 0, Math.PI * 2)
      g.fill()
    }
    hill(g, H * 0.8, 30, c.deep, 0.18, 0.06)
  },
  // Berry: soft shapes, warm and quiet.
  berry: (g) => {
    const c = BACKDROP_INKS.berry
    sky(g, "#FFFFFF", c.tint)
    glow(g, W * 0.2, H * 0.75, 320, "#F6C6D8", 0.8)
    glow(g, W * 0.82, H * 0.24, 280, c.glow, 0.85)
    glow(g, W * 0.6, H * 0.9, 240, "#F3B4CB", 0.55)
  },
}

/** Draws one backdrop. Pure but for the drawing. */
export function paintBackdrop(id: BackdropId, g: Paint2D): void {
  PAINT[id](g)
  g.globalAlpha = 1
}

const drawn = new Map<BackdropId, Promise<string>>()

/**
 * A backdrop as an image address (a blob: URL), drawn the first time it is
 * asked for and kept for the page's life. Rejects where the browser can't
 * draw one, which leaves the picker's other choices.
 */
export function backdropUrl(id: BackdropId): Promise<string> {
  let p = drawn.get(id)
  if (!p) {
    p = draw(id)
    drawn.set(id, p)
    p.catch(() => drawn.delete(id))
  }
  return p
}

async function draw(id: BackdropId): Promise<string> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(W, H)
    const g = canvas.getContext("2d")
    if (!g) throw new Error("This browser can't draw a backdrop")
    paintBackdrop(id, g as unknown as Paint2D)
    return URL.createObjectURL(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 }))
  }
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext("2d")
  if (!g) throw new Error("This browser can't draw a backdrop")
  paintBackdrop(id, g)
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9))
  if (!blob) throw new Error("This browser can't draw a backdrop")
  return URL.createObjectURL(blob)
}
