import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The playful layer (10 Oct 2026, "Tiles"): every Home card's icon sits on a
 * hued tint tile, and the lists carry each thing's identity hue. The icons
 * those tiles replaced were orange (the accent, which marks the one action on
 * a view) or grey; neither may come back.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", p), "utf8")

describe("Home's cards and lists", () => {
  it.each([
    "components/home/NoChannelsYet.tsx",
  ])("%s heads its card with a hued tile, not an accent or grey icon", (file) => {
    const src = read(file)
    expect(src).toMatch(/<Tile hue="(sun|moss|lake|sky|dusk|berry)"/)
    expect(src).not.toMatch(/className="h-4 w-4 shrink-0 text-primary"/)
    // A card lifts a pixel under the pointer (the playful layer, "Motion").
    expect(src).toMatch(/hover-lift/)
  })

  it.each(["components/home/desktop/desktopDashboard.tsx", "components/home/mobile/mobileHome.tsx"])(
    "%s marks recent things and channels in their own hue",
    (file) => {
      const src = read(file)
      expect(src).toMatch(/<IdentityMark variant="tile" size=\{24\} id=\{item\.id\}/)
      expect(src).toMatch(/<IdentityMark variant="tile" size=\{24\} id=\{channel\.ch_uuid\}/)
    },
  )

  it.each(["components/home/desktop/desktopDashboard.tsx", "components/home/mobile/mobileHome.tsx"])(
    "%s greets on the theme's wash, its one band",
    (file) => {
      const src = read(file)
      expect(src.match(/<GreetingBand/g)).toHaveLength(1)
      expect(src.indexOf("<GreetingBand")).toBeLessThan(src.indexOf("<PageHeader"))
      expect(read("components/home/GreetingBand.tsx")).toMatch(/bg-brand-wash/)
    },
  )
})
