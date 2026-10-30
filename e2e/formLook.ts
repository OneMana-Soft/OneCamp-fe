import type { Page } from "@playwright/test"

/**
 * A cover and a logo as a form's maker might add them (tables B5c-2), drawn as PNGs in the browser, which the
 * builder's upload takes and the public page's pictures are served as: a wide warm band, and a round mark.
 */
export async function lookPictures(page: Page): Promise<{ cover: Buffer; logo: Buffer }> {
  const [cover, logo] = await page.evaluate(() => {
    const png = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas")
      c.width = w
      c.height = h
      draw(c.getContext("2d")!)
      return c.toDataURL("image/png").split(",")[1]
    }
    return [
      png(1200, 360, (g) => {
        const sky = g.createLinearGradient(0, 0, 1200, 360)
        sky.addColorStop(0, "#ff9a62")
        sky.addColorStop(0.5, "#f25f8c")
        sky.addColorStop(1, "#6b5cff")
        g.fillStyle = sky
        g.fillRect(0, 0, 1200, 360)
        g.fillStyle = "rgba(255, 255, 255, 0.18)"
        for (let i = 0; i < 6; i++) {
          g.beginPath()
          g.arc(160 + i * 190, 300 - (i % 2) * 120, 90 + (i % 3) * 30, 0, Math.PI * 2)
          g.fill()
        }
      }),
      png(240, 240, (g) => {
        g.fillStyle = "#1f2a44"
        g.beginPath()
        g.arc(120, 120, 110, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = "#ffd166"
        g.font = "bold 96px sans-serif"
        g.textAlign = "center"
        g.textBaseline = "middle"
        g.fillText("AV", 120, 128)
      }),
    ]
  })
  return { cover: Buffer.from(cover, "base64"), logo: Buffer.from(logo, "base64") }
}
