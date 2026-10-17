import { describe, expect, it } from "vitest"
import { chordWords } from "./chord"

describe("a chord in the shortcut list's words", () => {
  it("says Mod as Ctrl/⌘, a letter as its capital, and a named key as it is", () => {
    expect(chordWords("Mod-z")).toBe("Ctrl/⌘ + Z")
    expect(chordWords("Mod-Enter")).toBe("Ctrl/⌘ + Enter")
    expect(chordWords("j")).toBe("J")
    expect(chordWords("Shift-c")).toBe("Shift + C")
    expect(chordWords("Backspace")).toBe("Backspace")
    expect(chordWords("?")).toBe("?")
  })

  it("draws the arrow keys as arrows", () => {
    expect(chordWords("Alt-ArrowUp")).toBe("Alt + ↑")
    expect(chordWords("Alt-Shift-ArrowDown")).toBe("Alt + Shift + ↓")
    expect(chordWords("ArrowLeft")).toBe("←")
  })
})
