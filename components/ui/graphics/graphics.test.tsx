import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Arc, Orbit, ProgressRing, Rings, SPOTS, Spark } from "@/components/ui/graphics"

/**
 * The motif and the spot illustrations are inline SVG, themed by the camp
 * tokens and decorative. Rendered to the string a server sends, so the byte
 * budget is the real one.
 */
const html = (el: ReactElement) => renderToStaticMarkup(el)

describe("the motif", () => {
  it("rings fade outward round the logo's ring, thin lines staying 1.5px", () => {
    const out = html(<Rings hue="sky" count={3} />)
    expect(out).toContain('class="hue-sky stroke-hue"')
    expect(out.match(/<circle/g)).toHaveLength(4)
    expect(out).toContain('vector-effect="non-scaling-stroke"')
    expect(out).toMatch(/opacity="0.6".*opacity="0.38".*opacity="0.22"/)
    expect(out).toContain('aria-hidden="true"')
  })

  it("rings without a hue take the text colour", () => {
    expect(html(<Rings core={false} count={2} />)).toContain('class="stroke-current"')
  })

  it("an orbit carries hued dots in the chart order, round a centre ring", () => {
    const out = html(<Orbit dots={4} />)
    for (const hue of ["sky", "moss", "sun", "dusk"]) expect(out).toContain(`hue-${hue} fill-hue`)
    expect(out).not.toContain("hue-berry")
    expect(out).toContain('stroke-dasharray="0 5"')
  })

  it("an arc sweeps the fraction of a turn it is given, from where it is told", () => {
    const out = html(<Arc hue="dusk" sweep={0.25} start={90} />)
    expect(out).toContain('stroke-dasharray="25 100"')
    expect(out).toContain('transform="rotate(0 50 50)"')
    expect(html(<Arc sweep={4} />)).toContain('stroke-dasharray="100 100"')
  })

  it("a spark is the four-point star, filled in its hue", () => {
    const out = html(<Spark hue="sun" size={16} />)
    expect(out).toContain('class="hue-sun fill-hue"')
    expect(out).toContain('width="16"')
  })
})

describe("the progress ring", () => {
  it("says what it measures and how far, and clamps what it is given", () => {
    const out = html(<ProgressRing value={140} label="Q4 launch, 12 of 12 done" />)
    expect(out).toContain('role="progressbar"')
    expect(out).toContain('aria-valuenow="100"')
    expect(out).toContain('aria-label="Q4 launch, 12 of 12 done"')
    expect(html(<ProgressRing value={-5} label="x" />)).toContain('aria-valuenow="0"')
  })

  it("fills with the theme's progress stops, the logo's gradient where none are set", () => {
    const out = html(<ProgressRing value={58} label="x">58%</ProgressRing>)
    expect(out).toContain("var(--progress-from, #FF8A00)")
    expect(out).toContain("var(--progress-to, #FF3D00)")
    expect(out).toContain('stroke-dasharray="58 100"')
    expect(out).toMatch(/stroke="url\(#progress-[\w-]+\)"/)
    expect(out).toContain(">58%<")
  })

  it("draws no arc at zero, so no round cap shows a dot of progress that is not there", () => {
    expect(html(<ProgressRing value={0} label="x" />).match(/<circle/g)).toHaveLength(1)
  })
})

describe("the spot illustrations", () => {
  const spots = Object.entries(SPOTS)

  it("are nine", () => {
    expect(spots).toHaveLength(9)
  })

  it.each(spots)("%s is tiny: 600 bytes of SVG at most", (_, Spot) => {
    // As SVG is written: React serialises an empty element as <circle></circle>
    // where the SVG itself is <circle/>, and the budget is for the drawing.
    const svg = html(<Spot />).replace(/><\/(circle|path|rect|stop|line)>/g, "/>")
    expect(svg.length, svg).toBeLessThanOrEqual(600)
  })

  it.each(spots)("%s is decorative, sized, and themed by the tokens alone", (_, Spot) => {
    const out = html(<Spot />)
    expect(out).toMatch(/^<svg viewBox="0 0 96 96" width="96" height="96"/)
    expect(out).toContain('aria-hidden="true"')
    expect(out).toMatch(/class="hue-(sun|moss|lake|sky|dusk|berry)/)
    // No raw colour: every fill and stroke is a token class or currentColor.
    expect(out).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    expect(out).not.toMatch(/<image|<img|href=/)
  })

  it("take a size and another hue", () => {
    const out = html(<SPOTS.docs size={48} hue="lake" className="mx-auto" />)
    expect(out).toContain('width="48"')
    expect(out).toContain('class="hue-lake mx-auto"')
  })
})
