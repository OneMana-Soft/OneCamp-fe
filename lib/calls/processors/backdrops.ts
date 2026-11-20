// The built-in backdrops, drawn here in the camp palette rather than shipped
// as pictures: nothing to license, nothing to download, and each one quiet
// enough that the person in front of it stays what people look at. Each is a
// scene (data: a palette and the shapes drawn in it) that one painter draws,
// once per id, on first use, into an image the background processor reads.
// A background made from words (meet-09) is a recipe the workspace's model
// writes: a palette, one of these scenes' layouts and a few extras, built
// into a scene here (sceneFromRecipe) and drawn by the same painter. The
// server holds only the layouts' and extras' names (business/AI/callBackground.go).

import { BACKDROP_IDS, BACKDROP_SIZE, type BackdropId } from "./effects"

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

/**
 * One thing a scene draws, in a palette colour (ink, by index), back to
 * front. x and y are fractions of the frame; r and rise are pixels, and
 * phase shifts a band's curve.
 * - sky: the whole frame, top (ink) to bottom (to).
 * - glow: a soft round light fading to nothing (a sun, a cloud).
 * - hill: a rolling band from side to side, filled to the bottom (land, water, mist).
 * - dot: a small disc (a star, a moon).
 */
export type SceneShape =
  | { kind: "sky"; ink: number; to: number }
  | { kind: "glow"; ink: number; x: number; y: number; r: number; alpha: number }
  | { kind: "hill"; ink: number; y: number; rise: number; alpha: number; phase?: number }
  | { kind: "dot"; ink: number; x: number; y: number; r: number; alpha: number }

/** A background as data. Its palette's order: sky top, sky bottom, land, deep land, light. */
export interface Scene {
  palette: readonly string[]
  shapes: readonly SceneShape[]
}

const [TOP, BOTTOM, LAND, DEEP, LIGHT] = [0, 1, 2, 3, 4]
const sky = (): SceneShape => ({ kind: "sky", ink: TOP, to: BOTTOM })
const glow = (ink: number, x: number, y: number, r: number, alpha: number): SceneShape => ({ kind: "glow", ink, x, y, r, alpha })
const hill = (ink: number, y: number, rise: number, alpha: number, phase = 0): SceneShape => ({ kind: "hill", ink, y, rise, alpha, phase })
const dots = (ink: number, at: readonly (readonly [number, number, number])[], alpha: number): SceneShape[] => at.map(([x, y, r]) => ({ kind: "dot", ink, x, y, r, alpha }))

/** A few stars high in the sky: Dusk's, and a recipe's "stars". */
const STARS = [[0.12, 0.16, 2.2], [0.27, 0.09, 1.6], [0.61, 0.13, 2], [0.78, 0.22, 1.4], [0.9, 0.1, 1.8], [0.45, 0.2, 1.2]] as const

/** The six built-ins, as scenes. */
export const BUILT_IN: Record<BackdropId, Scene> = {
  // Meadow: morning light over rolling green.
  moss: {
    palette: ["#FFFFFF", BACKDROP_INKS.moss.tint, BACKDROP_INKS.moss.base, BACKDROP_INKS.moss.deep, BACKDROP_INKS.moss.glow],
    shapes: [sky(), glow(LIGHT, 0.78, 0.26, 260, 0.9), hill(LAND, 0.62, 60, 0.18, 0.05), hill(LAND, 0.72, 50, 0.26, -0.08), hill(DEEP, 0.84, 40, 0.22, 0.1)],
  },
  // Sunrise: a low sun in warm bands.
  sun: {
    palette: [BACKDROP_INKS.sun.glow, BACKDROP_INKS.sun.tint, BACKDROP_INKS.sun.base, BACKDROP_INKS.sun.deep, "#FFD27A"],
    shapes: [sky(), glow(LIGHT, 0.5, 0.78, 420, 0.75), hill(LAND, 0.8, 24, 0.16), hill(DEEP, 0.9, 18, 0.14, 0.12)],
  },
  // Lagoon: still water under a pale sky.
  lake: {
    palette: [BACKDROP_INKS.lake.glow, BACKDROP_INKS.lake.tint, BACKDROP_INKS.lake.base, BACKDROP_INKS.lake.deep, "#FFFFFF"],
    shapes: [sky(), glow(LIGHT, 0.22, 0.3, 280, 0.85), hill(LAND, 0.66, 18, 0.16, 0.08), hill(LAND, 0.76, 22, 0.2, -0.06), hill(DEEP, 0.88, 16, 0.2, 0.04)],
  },
  // Open sky: clouds drifting high.
  sky: {
    palette: ["#CFE0FA", BACKDROP_INKS.sky.tint, BACKDROP_INKS.sky.base, BACKDROP_INKS.sky.deep, BACKDROP_INKS.sky.glow],
    shapes: [sky(), ...([[0.18, 0.3, 150], [0.32, 0.26, 120], [0.72, 0.42, 170], [0.86, 0.38, 120], [0.5, 0.7, 210]] as const).map(([x, y, r]) => glow(LIGHT, x, y, r, 0.9))],
  },
  // Dusk: the evening's last light, a few stars.
  dusk: {
    palette: ["#D9D0F7", BACKDROP_INKS.dusk.glow, BACKDROP_INKS.dusk.base, BACKDROP_INKS.dusk.deep, "#FFFFFF"],
    shapes: [sky(), glow(LIGHT, 0.3, 0.85, 380, 0.55), ...dots(LIGHT, STARS, 0.85), hill(DEEP, 0.8, 30, 0.18, 0.06)],
  },
  // Berry: soft shapes, warm and quiet.
  berry: {
    palette: ["#FFFFFF", BACKDROP_INKS.berry.tint, "#F6C6D8", "#F3B4CB", BACKDROP_INKS.berry.glow],
    shapes: [sky(), glow(LAND, 0.2, 0.75, 320, 0.8), glow(LIGHT, 0.82, 0.24, 280, 0.85), glow(DEEP, 0.6, 0.9, 240, 0.55)],
  },
}

/** What a recipe may add to its layout, in its light (the server's callExtras). Mist goes in front of the land, the rest behind it. */
export const EXTRAS = {
  sun: [glow(LIGHT, 0.8, 0.3, 240, 0.85), ...dots(LIGHT, [[0.8, 0.3, 46]], 0.95)],
  moon: [glow(LIGHT, 0.76, 0.22, 150, 0.35), ...dots(LIGHT, [[0.76, 0.22, 34]], 0.95)],
  stars: dots(LIGHT, STARS, 0.85),
  glow: [glow(LIGHT, 0.5, 0.38, 380, 0.5)],
  mist: [hill(LIGHT, 0.7, 16, 0.35, 0.1), hill(LIGHT, 0.82, 12, 0.3, -0.05)],
} satisfies Record<string, SceneShape[]>

/** What the workspace's model writes for a background made from words (POST /ai/call-background). */
export interface Recipe {
  palette: string[]
  layout: string
  extras: string[]
}

const HEX = /^#[0-9A-Fa-f]{6}$/

/**
 * A recipe's scene: its layout's composition (the first built-in's for a
 * layout it doesn't know) in the recipe's colours, each missing or malformed
 * one the layout's own, plus up to three known extras, each once. Pure.
 */
export function sceneFromRecipe(recipe: { palette?: unknown; layout?: unknown; extras?: unknown }): Scene {
  const base = BUILT_IN[BACKDROP_IDS.find((id) => id === recipe.layout) ?? BACKDROP_IDS[0]]
  const given: unknown[] = Array.isArray(recipe.palette) ? recipe.palette : []
  const palette = base.palette.map((own, i) => {
    const c = given[i]
    return typeof c === "string" && HEX.test(c) ? c.toUpperCase() : own
  })
  const named: unknown[] = Array.isArray(recipe.extras) ? recipe.extras : []
  const extras = [...new Set(named.filter((e): e is keyof typeof EXTRAS => typeof e === "string" && Object.hasOwn(EXTRAS, e)))].slice(0, 3)
  const behind = extras.filter((e) => e !== "mist").flatMap((e) => EXTRAS[e])
  return { palette, shapes: [base.shapes[0], ...behind, ...base.shapes.slice(1), ...(extras.includes("mist") ? EXTRAS.mist : [])] }
}

const { width: W, height: H } = BACKDROP_SIZE

/** Draws a scene: the one painter. A shape it doesn't know, or in a colour the palette hasn't got, draws nothing. */
export function paintScene(scene: Scene, g: Paint2D): void {
  for (const s of scene.shapes) {
    const ink = scene.palette[s.ink]
    if (!ink) continue
    if (s.kind === "sky") {
      const to = scene.palette[s.to]
      if (!to) continue
      const grad = g.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, ink)
      grad.addColorStop(1, to)
      g.fillStyle = grad
      g.globalAlpha = 1
      g.fillRect(0, 0, W, H)
    } else if (s.kind === "glow") {
      const [x, y] = [W * s.x, H * s.y]
      const grad = g.createRadialGradient(x, y, 0, x, y, s.r)
      grad.addColorStop(0, ink)
      grad.addColorStop(1, `${ink}00`)
      g.fillStyle = grad
      g.globalAlpha = s.alpha
      g.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2)
    } else if (s.kind === "hill") {
      const [y, phase] = [H * s.y, s.phase ?? 0]
      g.beginPath()
      g.moveTo(0, y)
      g.bezierCurveTo(W * (0.25 + phase), y - s.rise, W * (0.5 + phase), y + s.rise, W, y - s.rise * 0.4)
      g.lineTo(W, H)
      g.lineTo(0, H)
      g.closePath()
      g.fillStyle = ink
      g.globalAlpha = s.alpha
      g.fill()
    } else if (s.kind === "dot") {
      g.fillStyle = ink
      g.globalAlpha = s.alpha
      g.beginPath()
      g.arc(W * s.x, H * s.y, s.r, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.globalAlpha = 1
}

/** Draws one backdrop. Pure but for the drawing. */
export function paintBackdrop(id: BackdropId, g: Paint2D): void {
  paintScene(BUILT_IN[id], g)
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
    p = drawScene(BUILT_IN[id]).then((blob) => URL.createObjectURL(blob))
    drawn.set(id, p)
    p.catch(() => drawn.delete(id))
  }
  return p
}

/** A scene drawn at the backdrop's size, as a JPEG: a backdrop, or a scene made from words. Rejects where the browser can't draw one. */
export async function drawScene(scene: Scene): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(W, H)
    const g = canvas.getContext("2d")
    if (!g) throw new Error("This browser can't draw a backdrop")
    paintScene(scene, g as unknown as Paint2D)
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 })
  }
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext("2d")
  if (!g) throw new Error("This browser can't draw a backdrop")
  paintScene(scene, g)
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9))
  if (!blob) throw new Error("This browser can't draw a backdrop")
  return blob
}
