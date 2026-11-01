import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { ProjectStatusGlyph } from "./projectStatusGlyph"

// linear-15: a project's status draws its category's task glyph, and paused,
// which only a project has, from a module of its own, so the task glyphs every
// route carries keep their bytes (V-49).

afterEach(cleanup)

const glyph = (c: HTMLElement) => c.querySelector("svg")!

describe("a project's status glyph", () => {
  it("draws paused as the to-do ring with a pause's two bars, in the ring's ink-2, decorative unless labelled", () => {
    const { container } = render(<ProjectStatusGlyph status="paused" />)
    const svg = glyph(container)
    expect(svg.getAttribute("data-status-glyph")).toBe("paused")
    expect(svg.getAttribute("aria-hidden")).toBe("true")
    expect(svg.querySelector("circle")?.getAttribute("stroke")).toBe("var(--ink-2)")
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M6.6 5.9v4.2M9.4 5.9v4.2")
    expect(svg.getAttribute("width")).toBe("16")
  })

  it("draws a workspace's paused status in its own hue, on a tint in the hue's ink, and names it when labelled", () => {
    const { container } = render(<ProjectStatusGlyph status="paused" hue="dusk" onTint label="On hold" size={14} />)
    const svg = glyph(container)
    expect(svg.getAttribute("data-hue")).toBe("dusk")
    expect(svg.querySelector("circle")?.getAttribute("stroke")).toBe("var(--camp-dusk-ink)")
    expect(svg.getAttribute("role")).toBe("img")
    expect(svg.getAttribute("aria-label")).toBe("On hold")
    expect(svg.getAttribute("width")).toBe("14")
  })

  it("draws every other category as the task glyph of the same kind", () => {
    for (const status of ["todo", "progress", "done", "cancelled"] as const) {
      const { container, unmount } = render(<ProjectStatusGlyph status={status} hue="moss" />)
      expect(glyph(container).getAttribute("data-status-glyph")).toBe(status)
      expect(glyph(container).getAttribute("data-hue")).toBe("moss")
      unmount()
    }
  })
})
