import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { destinationHue } from "@/lib/destinationHue"

// The phone's Home in the playful layer: quick actions on tiles in their
// place's hue, recent things and channels marked in their own identity hue
// (the colour they have everywhere), and the AI row in the AI hue rather
// than the accent, which is kept for the one action a view asks for.

const src = readFileSync("components/home/mobile/mobileHome.tsx", "utf8")

describe("phone Home tiles", () => {
  it("sets every quick action on a tile in its place's hue, four different hues", () => {
    expect(src).toMatch(/<Tile hue=\{hue\} size="lg">/)
    const paths = [...src.matchAll(/<QuickActionTile[\s\S]*?hue=\{destinationHue\("([^"]+)"\)\}/g)].map((m) => m[1])
    expect(paths).toEqual(["/app/chat", "/app/channel", "/app/doc", "/app/myTask"])
    expect(new Set(paths.map(destinationHue)).size).toBe(4)
  })

  it("marks recent things and channels with their identity hue", () => {
    expect(src).toMatch(/leading=\{<IdentityMark variant="tile" size=\{24\} id=\{item\.id\}/)
    expect(src).toMatch(/leading=\{<IdentityMark variant="tile" size=\{24\} id=\{channel\.ch_uuid\}/)
  })

  it("keeps the accent off the AI row's icon", () => {
    expect(src).not.toMatch(/<Sparkles[^>]*text-primary/)
    expect(src).toContain('<Tile hue={destinationHue("/app/ai")}>')
  })
})
