import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The board's canvas follows the colour theme: Excalidraw's lavender primary is
// replaced by the theme's brand, after Excalidraw's own sheet, on both boards
// and a guest's view of one.
const css = readFileSync("components/board/excalidrawTheme.css", "utf8")

describe("the board canvas's colours", () => {
  it("takes the theme's brand for every primary shade, in light and dark", () => {
    for (const v of ["--color-surface-primary-container:", "--color-on-primary-container:", "--color-primary:", "--color-primary-darker:", "--color-primary-darkest:", "--color-primary-hover:", "--color-primary-light:", "--color-primary-light-darker:"]) {
      expect(css).toContain(v)
    }
    expect(css).toMatch(/\.excalidraw\.excalidraw\.theme--dark/)
    expect(css).not.toMatch(/#6965db/i)
  })
  for (const f of ["components/board/boardCanvas.tsx", "components/guest/GuestBoardViewer.tsx"]) {
    it(`is loaded after Excalidraw's sheet in ${f}`, () => {
      const src = readFileSync(f, "utf8")
      expect(src.indexOf("excalidrawTheme.css")).toBeGreaterThan(src.indexOf("@excalidraw/excalidraw/index.css"))
    })
  }
})
