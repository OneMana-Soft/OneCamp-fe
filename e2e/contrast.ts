import type { Locator, Page } from "@playwright/test"

/** An element's text colour, and its ground as drawn: the commonest pixel of a screenshot of it (its words and edge are few). */
export async function inkAndGround(page: Page, el: Locator) {
  const png = await page.screenshot({ clip: (await el.boundingBox())! })
  return el.evaluate(async (node, bytes) => {
    const pixels = (w: number, h: number, draw: (c: OffscreenCanvasRenderingContext2D) => void) => {
      const c = new OffscreenCanvas(w, h).getContext("2d")!
      draw(c)
      return c.getImageData(0, 0, w, h).data
    }
    const shot = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }))
    const px = pixels(shot.width, shot.height, (c) => c.drawImage(shot, 0, 0))
    const seen = new Map<number, number>()
    for (let i = 0; i < px.length; i += 4) {
      const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    const g = [...seen].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    // Painting the computed colour has the browser resolve the token (oklch too) to sRGB.
    const [r, gr, b] = pixels(1, 1, (c) => {
      c.fillStyle = getComputedStyle(node).color
      c.fillRect(0, 0, 1, 1)
    })
    return { ink: { r, g: gr, b }, ground: { r: g >> 16, g: (g >> 8) & 255, b: g & 255 } }
  }, [...png])
}
