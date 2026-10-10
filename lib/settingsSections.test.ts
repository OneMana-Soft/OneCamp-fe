import { describe, expect, it } from "vitest"
import { SETTINGS_SECTIONS, sectionAccess } from "./settingsSections"

// Each of a person's settings sections has its own camp hue, shown on its tile
// in the list of sections and at the top of its page, so a section is
// recognised by colour as well as by name (the playful layer). No two
// sections share a hue.
describe("settings section hues", () => {
  it("gives each section the hue the design system assigned it", () => {
    const hues = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s.href, s.hue]))
    expect(hues).toEqual({
      "/app/settings/notifications": "sun",
      "/app/settings/connectors": "lake",
      "/app/settings/workflows": "moss",
      "/app/settings/api-tokens": "berry",
    })
  })

  it("never gives two sections the same hue", () => {
    expect(new Set(SETTINGS_SECTIONS.map((s) => s.hue)).size).toBe(SETTINGS_SECTIONS.length)
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
