import { describe, expect, it } from "vitest"
import { chordMatches, chordWords } from "./chord"

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

describe("a chord pressed", () => {
  const press = (o: Partial<KeyboardEvent> & { code?: string }) => ({ key: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o })

  it("reads ⌥ with a letter or digit on a Mac by the key's place, since ⌥ types a symbol there", () => {
    expect(chordMatches(press({ key: "¥", code: "KeyY", altKey: true }), "Alt-y", true)).toBe(true)
    expect(chordMatches(press({ key: "¡", code: "Digit1", altKey: true, metaKey: true }), "Mod-Alt-1", true)).toBe(true)
    // Not elsewhere, where Alt with a letter types the letter, and not for another key.
    expect(chordMatches(press({ key: "¥", code: "KeyY", altKey: true }), "Alt-y", false)).toBe(false)
    expect(chordMatches(press({ key: "Ω", code: "KeyZ", altKey: true }), "Alt-y", true)).toBe(false)
    expect(chordMatches(press({ key: "y", code: "KeyY", altKey: true }), "Alt-y", false)).toBe(true)
  })
})
