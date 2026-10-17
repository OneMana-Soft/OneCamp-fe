import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { ChannelTile } from "./ChannelTile"
import { placeHue } from "@/lib/placeHue"
import { TILE_SIZES } from "./ProjectTile"
import { hueFor } from "@/lib/campHue"

// INTERACTION_SPEC D13: a channel's tile, in its own hue, the one the sidebar,
// the list, its header, the palette, search and Later all draw.

afterEach(cleanup)

const ID = "c0de0000-0000-4000-8000-000000000003"

describe("a channel's tile (D13)", () => {
  it("is its id's hue, a tint tile at the project tile's size and radius, the # in the hue", () => {
    const tile = render(<ChannelTile id={ID} size={32} />).container.querySelector<HTMLElement>("[data-channel-tile]")!
    expect(tile.dataset.channelTile).toBe("32")
    expect(tile.dataset.hue).toBe(hueFor(ID))
    expect(tile.className).toContain(`hue-${hueFor(ID)}`)
    expect(tile.className).toContain("bg-hue-tint")
    expect(tile.style.width).toBe("32px")
    expect(tile.style.borderRadius).toBe(`${TILE_SIZES[32].radius}px`)
    expect(tile.getAttribute("aria-hidden")).toBe("true")
    const glyph = tile.querySelector("svg")!
    expect(glyph.getAttribute("class")).toMatch(/lucide-hash/)
    // The glyph carries the hue itself, so a nav row's icon colour can't grey it.
    expect(glyph.getAttribute("class")).toMatch(/\btext-hue\b/)
    expect(glyph.style.width).toBe(`${TILE_SIZES[32].glyph}px`)
  })

  it("draws a lock for a private channel", () => {
    expect(render(<ChannelTile id={ID} isPrivate />).container.querySelector("svg")!.getAttribute("class")).toMatch(/lucide-lock/)
  })

  it("is the hue its rows tint in, wherever it is listed (lib/placeHue)", () => {
    const tile = render(<ChannelTile id={ID} />).container.querySelector("[data-channel-tile]")!
    expect(tile.getAttribute("data-hue")).toBe(placeHue("channel", ID))
  })
})
