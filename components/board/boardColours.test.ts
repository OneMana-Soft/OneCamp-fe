import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CAMP_HUES } from "@/lib/campHue"
import { personHue } from "@/lib/utils/getAvatarColor"
import { BOARD_ON_SCREEN, cursorColours } from "./boardColours"

/** WCAG 2 contrast of two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** One name per camp hue, so every hue is checked. */
const people = CAMP_HUES.map((hue) => {
  for (let n = 0; n < 500; n++) if (personHue(`Person ${n}`) === hue) return `Person ${n}`
  throw new Error(`no name falls in ${hue}`)
})

describe("a collaborator's cursor on a board", () => {
  it("is their avatar's camp hue, the same on every screen", () => {
    // Kai Lin's avatar is berry; so is his cursor (M7: it was brick red).
    expect(personHue("Kai Lin (guest)")).toBe("berry")
    expect(cursorColours("Kai Lin (guest)", true)).toEqual({ fill: "#F9C2D6", text: "#962556", edge: "#121212" })
    expect(cursorColours("Kai Lin (guest)", false)).toEqual({ fill: "#962556", text: "#FFFFFF", edge: "#FFFFFF" })
    expect(cursorColours("Sam Rivera", true)).toEqual(cursorColours("Sam Rivera", true))
  })

  it("reads at least 3:1 on a call's dark stage, with a name at 4.5:1, for every hue", () => {
    for (const person of people) {
      const c = cursorColours(person, true)
      expect(contrast(c.fill, BOARD_ON_SCREEN.dark), person).toBeGreaterThanOrEqual(3)
      expect(contrast(c.text, c.fill), person).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("reads at least 3:1 on a light board, with a name at 4.5:1, for every hue", () => {
    for (const person of people) {
      const c = cursorColours(person, false)
      expect(contrast(c.fill, BOARD_ON_SCREEN.light), person).toBeGreaterThanOrEqual(3)
      expect(contrast(c.text, c.fill), person).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("takes the camp's own inks, never a hand-picked colour", () => {
    const src = readFileSync("components/board/boardColours.ts", "utf8")
    const css = readFileSync("app/globals.css", "utf8").toUpperCase()
    let n = 0
    for (const m of src.matchAll(/(sun|moss|lake|sky|dusk|berry): "(#[0-9A-F]{6})"/gi)) {
      expect(css, `${m[1]} ${m[2]}`).toContain(`--CAMP-${m[1].toUpperCase()}-INK: ${m[2].toUpperCase()}`)
      n++
    }
    expect(n).toBe(12)
  })
})
