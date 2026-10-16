import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { SpotError } from "./spots"

// Critic, 11 Oct. The error spot was the ring with a piece out and the piece
// drawn beside it as an arc: on every failure screen ("Couldn't connect
// GitHub", a dead guest link, a page that won't load) it read as a loading
// spinner, as if the thing that had failed were still trying. DESIGN_V3 §0
// reason 9 names exactly that ("graphics read as loading spinners"). It is a
// page with a "!" now, the object every other spot has.
describe("the error spot", () => {
  const svg = renderToStaticMarkup(<SpotError />)

  it("draws an object, a page on the card colour", () => {
    expect(svg).toMatch(/<rect[^>]*class="fill-card stroke-hue-ink"/)
  })

  it("has no arc, so nothing in it reads as a spinner", () => {
    const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])
    for (const d of paths) expect(d, d).not.toMatch(/[aA]\s*\d/)
  })
})
