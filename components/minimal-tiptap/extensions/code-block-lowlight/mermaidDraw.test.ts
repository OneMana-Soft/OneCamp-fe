import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { renderMermaid } from "./mermaid"

// Mermaid draws in a <div id="d…"> of its own at the end of the page, and on
// a mistake leaves its error drawing there. Several blocks draw at once (a doc
// opening, its theme changing), so a draw clears away only its own.

const TOKENS = { "--sheet": "#ffffff", "--raised": "#ffffff", "--ink": "#16171b", "--ink-2": "#5b5d65", "--ink-3": "#67696f", "--sunken": "#f8f9fa", "--font-sans": "Inter" }
const svg = SVGElement.prototype as unknown as Record<string, unknown>

beforeAll(() => {
  // jsdom measures no text and has none of the page's tokens.
  svg.getComputedTextLength = () => 40
  svg.getBBox = () => ({ x: 0, y: 0, width: 40, height: 16 })
  for (const [name, value] of Object.entries(TOKENS)) document.documentElement.style.setProperty(name, value)
})
afterAll(() => {
  delete svg.getComputedTextLength
  delete svg.getBBox
  for (const name of Object.keys(TOKENS)) document.documentElement.style.removeProperty(name)
})

/** What drawing has left at the end of the page. */
const leftInPage = () => Array.from(document.body.children, (e) => `${e.tagName.toLowerCase()}#${e.id}`)

describe("drawing a Mermaid diagram", () => {
  it("leaves nothing in the page after a mistake", async () => {
    expect(await renderMermaid("graph TD; A-->")).toEqual({ error: expect.stringMatching(/^Parse error/) })
    expect(leftInPage()).toEqual([])
  })

  it("draws a sound diagram while one with a mistake draws beside it", async () => {
    const [broken, sound] = await Promise.all([renderMermaid("graph TD; A-->"), renderMermaid("graph TD; A-->B")])
    expect(broken).toEqual({ error: expect.stringMatching(/^Parse error/) })
    expect(sound).toEqual({ svg: expect.stringContaining("<svg") })
    expect(leftInPage()).toEqual([])
  })
})
