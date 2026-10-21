import { describe, expect, it } from "vitest"
import { SETTINGS_SECTIONS, sectionAccess } from "./settingsSections"

// Each of a person's settings sections shows one hue, on its tile in the list
// of sections, at the top of its page and in every menu that lists it: its
// area's (lib/areas), or ink for a section that names no area.
describe("settings section hues", () => {
  // Colour names an area (lib/areas, DESIGN-BUILD-3's ruling, 20 Oct): a
  // section of an area wears the area's hue, any other is ink, so sections in
  // one area share it. The old "one hue per section, none shared" is retired.
  it("gives each section its area's hue, and ink to a section that names no area", () => {
    const hues = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.href, s.hue]))
    expect(hues).toEqual({
      "/app/settings/notifications": "ink",
      "/app/settings/connectors": "ink",
      "/app/settings/workflows": "ink",
      "/app/settings/api-tokens": "ink",
    })
  })
})

// Whether a section is offered is answered by this person's permissions.
// Until they have answered, a gated section is "unknown", so the list can hold its place instead of
// inserting rows when the answers arrive.
describe("which sections are offered", () => {
  const all = () => true
  const none = () => false
  const section = (href: string) => SETTINGS_SECTIONS.find((s) => s.href === href)!

  it("offers an ungated section at once", () => {
    expect(sectionAccess(section("/app/settings/notifications"), { can: none, capabilitiesKnown: false, ai: "unknown" })).toBe("shown")
  })

  it("holds a permission-gated section until the permissions answer", () => {
    expect(sectionAccess(section("/app/settings/workflows"), { can: none, capabilitiesKnown: false, ai: "available" })).toBe("unknown")
    expect(sectionAccess(section("/app/settings/workflows"), { can: all, capabilitiesKnown: true, ai: "available" })).toBe("shown")
    expect(sectionAccess(section("/app/settings/workflows"), { can: none, capabilitiesKnown: true, ai: "available" })).toBe("hidden")
  })
})
