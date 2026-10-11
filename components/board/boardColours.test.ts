import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { hueFor } from "@/lib/campHue"
import { avatarColour, collaboratorColour } from "./boardColours"

describe("a collaborator's pointer on a board", () => {
  it("is their avatar's colour (the a1 stop), the same on every screen", () => {
    const id = "289b6b5d-c30c-427a-bcec-634cb294f285"
    expect(collaboratorColour(id).background).toBe(avatarColour(hueFor(id)))
    expect(collaboratorColour(id)).toEqual(collaboratorColour(id))
    expect(collaboratorColour(id).background).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it("reads the theme's avatar tokens, never a hand-picked colour", () => {
    const src = readFileSync("components/board/boardColours.ts", "utf8")
    expect(src).toMatch(/--camp-\$\{hue\}-a1/)
    // The light fallbacks are the token values themselves (app/globals.css).
    const css = readFileSync("app/globals.css", "utf8")
    for (const m of src.matchAll(/(sun|moss|lake|sky|dusk|berry): "(#[0-9A-F]{6})"/gi)) {
      const [, hue, hex] = m
      const tokens = [`--camp-${hue}: ${hex}`, `--camp-${hue}-a1: ${hex}`, `--camp-${hue}-tint`]
      expect(tokens.some((t) => css.toUpperCase().includes(t.toUpperCase()))).toBe(true)
    }
  })
})
