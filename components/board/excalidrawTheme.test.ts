import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The board's canvas is in OneCamp's materials (content.md B04): Excalidraw's
// lavender primary is replaced by the theme's brand, its islands are the pop
// surface at e3, and its tool bar sits at the bottom centre with a brand dot
// under the chosen tool. All of it is variable and selector overrides, loaded
// after Excalidraw's own sheet on boards and on a guest's view of one.
const css = readFileSync("components/board/excalidrawTheme.css", "utf8")

describe("the board canvas's chrome", () => {
  it("takes the theme's brand for every primary shade, in light and dark", () => {
    for (const v of ["--color-surface-primary-container:", "--color-on-primary-container:", "--color-primary:", "--color-primary-darker:", "--color-primary-darkest:", "--color-primary-hover:", "--color-primary-light:", "--color-primary-light-darker:", "--color-selection:"]) {
      expect(css).toContain(v)
    }
    expect(css).toMatch(/\.excalidraw\.excalidraw\.theme--dark/)
    expect(css).not.toMatch(/#6965db/i)
  })

  it("draws its islands on the pop surface at e3, in both themes", () => {
    const dark = css.slice(css.indexOf(".excalidraw.excalidraw.theme--dark {"))
    for (const block of [css, dark]) {
      expect(block).toMatch(/--island-bg-color: var\(--pop\)/)
      expect(block).toMatch(/--shadow-island: var\(--e3\)/)
    }
  })

  it("moves the tool bar to the bottom centre and marks the chosen tool with a brand dot", () => {
    expect(css).toMatch(/\.shapes-section \{[^}]*bottom: 0;[^}]*translateX\(-50%\)/)
    expect(css).toMatch(/:checked \+ \.ToolIcon__icon::after \{[^}]*background: var\(--brand\)/)
  })

  it("fades the board's clusters while someone draws", () => {
    expect(css).toMatch(/\[data-board-drawing="true"\] \[data-board-chrome\] \{\s*opacity: 0\.6;/)
  })

  it("sends the bar beside a selection away while a note moves by hand, and fades it back in at the drop (miro-06)", () => {
    // Gone at once, with no pointer and no tab stop; back by fading in only, in the chrome's own hover time.
    expect(css).toMatch(/\[data-board-moving="true"\] \[data-following-bar\] \{\s*opacity: 0;\s*visibility: hidden;\s*transition: none;/)
    expect(css).toMatch(/\[data-following-bar\] \{\s*transition: opacity var\(--duration-hover\) var\(--ease-out\);/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-following-bar\] \{\s*transition: none;/)
  })

  it("draws no bottom bar on a call's stage for someone who can't draw", () => {
    expect(css).toMatch(/\[data-call-board\]\[data-board-view-only\] \.excalidraw \.App-bottom-bar \{\s*display: none;/)
  })

  it("draws a viewer's bottom bar on a phone only while it holds Scroll back to content", () => {
    // In view mode the bar holds the main menu's trigger too, which the board
    // hides; a rule that asks for any button would always find that one.
    expect(css).toMatch(/\.excalidraw--view-mode \.App-bottom-bar:not\(:has\(\.scroll-back-to-content\)\) \{\s*display: none;/)
    expect(css).toMatch(/\.main-menu-trigger,[^{]*\{\s*display: none;/)
    expect(css).not.toMatch(/\.App-bottom-bar:not\(:has\(button\)\)/)
  })

  for (const f of ["components/board/boardCanvas.tsx", "components/guest/GuestBoardViewer.tsx"]) {
    it(`is loaded after Excalidraw's sheet in ${f}`, () => {
      const src = readFileSync(f, "utf8")
      expect(src.indexOf("excalidrawTheme.css")).toBeGreaterThan(src.indexOf("@excalidraw/excalidraw/index.css"))
    })
  }
})
