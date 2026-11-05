import { readdirSync, readFileSync } from "node:fs"
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
    expect(css).toMatch(/\[data-board-moving="true"\] \[data-following-bar\],?[^{]*\{\s*opacity: 0;\s*visibility: hidden;\s*transition: none;/)
    expect(css).toMatch(/\[data-following-bar\] \{\s*transition: opacity var\(--duration-hover\) var\(--ease-out\);/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-following-bar\] \{\s*transition: none;/)
  })

  it("sends the bar beside a selection away while Excalidraw's own menu is open, so it never covers a row of it (miro-44, DB-113 F2)", () => {
    // The same way as for a move: at once, back when the menu closes. Only on the board's page, where the bars are.
    expect(css).toMatch(/\[data-board-page\]:has\(\.excalidraw \.context-menu\) \[data-following-bar\] \{\s*opacity: 0;\s*visibility: hidden;\s*transition: none;/)
  })

  it("draws no bottom bar on a call's stage for someone who can't draw", () => {
    expect(css).toMatch(/\[data-call-board\]\[data-board-view-only\] \.excalidraw \.App-bottom-bar \{\s*display: none;/)
  })

  it("scrolls a phone's tool row sideways on every board, so a finger reaches More tools and the board never slides under it (miro-40 H1)", () => {
    const boards = css.slice(0, css.indexOf("/* ---- on a call's stage"))
    expect(boards).toMatch(/\n\.excalidraw\.excalidraw \.App-toolbar--mobile \{[^}]*overflow-x: auto;[^}]*overscroll-behavior-x: contain;[^}]*scrollbar-width: none;/)
    expect(boards).toMatch(/\n\.excalidraw\.excalidraw \.App-toolbar--mobile \.ToolIcon \{\s*scroll-snap-align: start;/)
    // Never a size container on a board of its own: containment would hold a
    // docked sheet (position: fixed) inside the board, under the board's buttons.
    expect(boards).not.toMatch(/container-type/)
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

describe("a card on the canvas wears OneCamp's marks, not Excalidraw's (DB-54)", () => {
  it("Excalidraw's hover pill is hidden on cards only, so it never covers a card's name", () => {
    expect(css).toMatch(/\.excalidraw__embeddable-container__inner:has\(\[data-board-card\]\) > \.excalidraw__embeddable-hint \{\s*display: none;/)
  })

  it("Excalidraw's link popup stays shut over a selected card: a card is its own link (boardExcalidraw marks the board)", () => {
    expect(css).toMatch(/\[data-card-link-popup\] \.excalidraw \.excalidraw-hyperlinkContainer \{\s*display: none;/)
  })

  it("no style panel while only cards are selected: its strokes and fills mean nothing for a live card (DB-56 MUST 1)", () => {
    expect(css).toMatch(/\[data-cards-selected\] \.excalidraw\.excalidraw \.App-menu__left \{\s*display: none;/)
  })

  it("Excalidraw draws no link badge beside a card, which keeps its link (patches/@excalidraw__excalidraw)", () => {
    // The badge's one test, in both of the package's builds: a linked element that isn't selected gets the badge.
    const dist = "node_modules/@excalidraw/excalidraw/dist"
    for (const build of ["dev", "prod"]) {
      const src = readdirSync(`${dist}/${build}`)
        .filter((f) => f.endsWith(".js"))
        .map((f) => readFileSync(`${dist}/${build}/${f}`, "utf8"))
        .join("\n")
      expect(src, build).not.toMatch(/\.link\s*&&\s*!\s*\w+\.selectedElementIds\[/)
      expect(src, build).toMatch(/\.link\s*&&\s*\w+\.customData\?\.kind\s*!==\s*"card"\s*&&\s*!\s*\w+\.selectedElementIds\[/)
    }
  })
})

describe("the board's overlays on the app's scale", () => {
  it("lays Excalidraw's dialogs on the app's modal layer, so a toast, a tooltip or a confirm said while one is open is drawn over it (V-491)", () => {
    // Excalidraw portals its dialogs (Save as image, Help, a confirm) into a container on the body at a layer of its own,
    // --zIndex-modal (1000), above the app's whole scale; a refused export's toast (800) was drawn under its dialog.
    const lib = readFileSync("node_modules/@excalidraw/excalidraw/dist/prod/index.css", "utf8")
    expect(lib).toContain(".excalidraw.excalidraw-modal-container{position:absolute;z-index:var(--zIndex-modal)}")
    expect(lib).toMatch(/--zIndex-modal: ?1000/)
    // The board's theme puts that container on the app's modal layer, by a selector that outranks the library's.
    expect(css).toMatch(/\.excalidraw\.excalidraw\.excalidraw-modal-container \{[^}]*z-index: var\(--z-modal\);/)
    // And the app's scale keeps every layer said over a dialog above it.
    const scale = readFileSync("app/globals.css", "utf8")
    const z = (name: string) => Number(scale.match(new RegExp(`--z-${name}: (\\d+);`))?.[1])
    for (const over of ["popover", "dropdown", "confirm", "tooltip", "toast"]) expect(z(over), over).toBeGreaterThan(z("modal"))
  })
})
