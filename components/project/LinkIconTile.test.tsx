import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

import { LinkIconTile } from "./LinkIconTile"

// basecamp-16 (DB-69's LIVE look): a site's icon sits on a light tile in dark
// too, so a black mark (GitHub's) reads; the link glyph keeps the neutral tile.

afterEach(cleanup)

const tile = (c: HTMLElement) => c.querySelector("[data-link-tile]")!

describe("a project link's icon tile", () => {
  it("puts the site's icon on the light tile with the hairline, in dark too", () => {
    const { container } = render(<LinkIconTile src="/project/p/links/l/icon" />)
    expect(tile(container).getAttribute("data-link-tile")).toBe("picture")
    expect(tile(container).className).toContain("dark:bg-white")
    expect(tile(container).className).toContain("ring-line")
    expect(tile(container).querySelector("img")?.getAttribute("src")).toBe("/project/p/links/l/icon")
  })

  it("shows the link glyph on the neutral tile for a link with no icon", () => {
    const { container } = render(<LinkIconTile src="" size="card" />)
    expect(tile(container).getAttribute("data-link-tile")).toBe("glyph")
    expect(tile(container).className).not.toContain("dark:bg-white")
    expect(tile(container).className).toContain("size-9")
    expect(tile(container).querySelector("img")).toBeNull()
    expect(tile(container).querySelector("svg")).not.toBeNull()
  })

  it("falls back to the glyph when the picture can't come, and another link's picture comes fresh", () => {
    const { container, rerender } = render(<LinkIconTile src="/a/icon" />)
    fireEvent.error(tile(container).querySelector("img")!)
    expect(tile(container).getAttribute("data-link-tile")).toBe("glyph")
    expect(tile(container).className).not.toContain("dark:bg-white")
    rerender(<LinkIconTile src="/b/icon" />)
    expect(tile(container).getAttribute("data-link-tile")).toBe("picture")
  })
})
