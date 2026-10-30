import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { placeInSentence, placeLabel } from "./CallStage"
import { STAGE_BOARD_FRAME } from "./boardFrame"

// Package B's carried design should-fixes (DESIGN-BUILD-23 and -24, 27-28 Oct):
// the call's place pill is a label, the board has an edge on the call's dark,
// and a board's own chrome fits the call's stage.
const theme = readFileSync("components/board/excalidrawTheme.css", "utf8")
const stageRules = theme.slice(theme.indexOf("/* ---- on a call's stage"))

describe("the call's place pill", () => {
  it("names the place, not a description of it", () => {
    expect(placeLabel("in an instant meeting")).toBe("Instant meeting")
    expect(placeLabel("in your room")).toBe("Your room")
    expect(placeLabel("in #engineering")).toBe("#engineering")
    expect(placeLabel("with Sam Rivera")).toBe("Sam Rivera")
    expect(placeLabel(undefined)).toBeUndefined()
  })
})

describe("a board on a call's stage", () => {
  it("draws its edge over the canvas, not under it", () => {
    expect(STAGE_BOARD_FRAME).not.toMatch(/(^| )ring-1( |$)/)
    expect(STAGE_BOARD_FRAME).toMatch(/after:absolute after:inset-0 after:z-30[^"]*after:ring-1 after:ring-inset/)
    expect(STAGE_BOARD_FRAME).toContain("after:pointer-events-none")
  })
  it("scrolls a phone's tool row inside the frame, faded by the one shared rule, never a mask of its own", () => {
    expect(stageRules).toMatch(/\[data-call-board\] \.excalidraw \.App-toolbar--mobile \{[^}]*max-width: calc\(100cqw - 16px\);[^}]*overflow-x: auto;/)
    expect(stageRules).not.toMatch(/mask-image/)
    expect(stageRules).toMatch(/\.App-toolbar--mobile \.ToolIcon \{\s*scroll-snap-align: start;/)
  })
  it("gives the phone's tool row and bottom bar the call's light shade, and the bottom bar hugs Undo and Redo", () => {
    expect(stageRules).not.toMatch(/0 24px 48px/)
    expect(stageRules).toMatch(/\[data-call-board\] \.excalidraw \{\s*container-type: inline-size;/)
    expect(stageRules).toMatch(/\.App-bottom-bar > \.Island:not\(:has\(\.panelColumn\)\) \{[^}]*width: auto;[^}]*min-width: 0;[^}]*margin-left: auto;/)
  })
  it("keeps the zoom cluster clear of the call's toasts at the bottom right on a wide stage", () => {
    expect(stageRules).toMatch(/@media \(min-width: 731px\) \{\s*\[data-call-board\] \.excalidraw \.layer-ui__wrapper__footer-left \{\s*margin-left: 0;/)
  })
})

describe("where the call is, in a sentence and as a label", () => {
  it("drops the preposition for a sentence, and the article too for a label", () => {
    expect(placeInSentence("in an instant meeting")).toBe("an instant meeting")
    expect(placeInSentence("with Sam Rivera")).toBe("Sam Rivera")
    expect(placeInSentence(undefined)).toBeUndefined()
    expect(placeLabel("in an instant meeting")).toBe("Instant meeting")
  })
})
