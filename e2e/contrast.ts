import type { Locator, Page } from "@playwright/test"

type Clip = { x: number; y: number; width: number; height: number }

/** A page region's pixels as drawn, RGBA row by row: a screenshot of it, decoded in the page. */
export async function pixelsAt(page: Page, clip: Clip): Promise<number[]> {
  const png = await page.screenshot({ clip })
  return page.evaluate(async (bytes) => {
    const shot = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }))
    const c = new OffscreenCanvas(shot.width, shot.height).getContext("2d")!
    c.drawImage(shot, 0, 0)
    return [...c.getImageData(0, 0, shot.width, shot.height).data]
  }, [...png])
}

/** The commonest colour among RGBA pixels: a region's ground (its words and edges are few). */
export function groundOf(px: ArrayLike<number>) {
  const seen = new Map<number, number>()
  for (let i = 0; i < px.length; i += 4) {
    const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const g = [...seen].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  return { r: g >> 16, g: (g >> 8) & 255, b: g & 255 }
}

/**
 * How far the colours drawn in a region spread: the farthest any pixel is from the region's ground, on its farthest
 * channel. A veil over the region shrinks it to the share that shows through; a hole in the veil keeps it.
 */
export function spreadOf(px: ArrayLike<number>) {
  const { r, g, b } = groundOf(px)
  let most = 0
  for (let i = 0; i < px.length; i += 4) most = Math.max(most, Math.abs(px[i] - r), Math.abs(px[i + 1] - g), Math.abs(px[i + 2] - b))
  return most
}

/** An element's text colour, and its ground as drawn: the commonest pixel of a screenshot of it (its words and edge are few). */
export async function inkAndGround(page: Page, el: Locator) {
  const ground = groundOf(await pixelsAt(page, (await el.boundingBox())!))
  // Painting the computed colour has the browser resolve the token (oklch too) to sRGB.
  const ink = await el.evaluate((node) => {
    const c = new OffscreenCanvas(1, 1).getContext("2d")!
    c.fillStyle = getComputedStyle(node).color
    c.fillRect(0, 0, 1, 1)
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data
    return { r, g, b }
  })
  return { ink, ground }
}


/**
 * The colour drawn behind an element, as the browser resolves it (oklch and
 * tokens too) in sRGB: its background and its ancestors', each translucent
 * one laid over the ones under it, down to the first opaque one. For a mark
 * whose own pixels would win a screenshot (a 1x1 stub picture fills its box).
 */
export async function groundBehind(el: Locator) {
  return el.evaluate((node) => {
    const c = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!
    const rgba = (paint: string) => {
      c.clearRect(0, 0, 1, 1)
      c.fillStyle = paint
      c.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    const layers: { r: number; g: number; b: number; a: number }[] = []
    for (let at: Element | null = node; at; at = at.parentElement) {
      const layer = rgba(getComputedStyle(at).backgroundColor)
      if (layer.a === 0) continue
      layers.push(layer)
      if (layer.a === 1) break
    }
    // A page that paints nothing shows the browser's white canvas.
    let ground = { r: 255, g: 255, b: 255 }
    for (const l of layers.reverse()) ground = { r: l.r * l.a + ground.r * (1 - l.a), g: l.g * l.a + ground.g * (1 - l.a), b: l.b * l.a + ground.b * (1 - l.a) }
    return { r: Math.round(ground.r), g: Math.round(ground.g), b: Math.round(ground.b) }
  })
}
