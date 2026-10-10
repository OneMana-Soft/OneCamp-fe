import { describe, expect, it } from "vitest"

import { hueFor } from "@/lib/campHue"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"

/**
 * A person without a photo is drawn in their camp hue: tint behind, ink
 * initials, a hairline of the strong cut. The same person is the same colour
 * on every screen, which is the whole reason the colour is there.
 */
describe("the avatar fallback", () => {
  it("draws a person in their own hue: tint, ink initials, a strong hairline", () => {
    const hue = hueFor("Maya Chen")
    const cls = getAvatarFallbackClass("Maya Chen")
    expect(cls).toContain(`hue-${hue}`)
    expect(cls).toContain("bg-hue-tint")
    expect(cls).toContain("text-hue-ink")
    expect(cls).toMatch(/\bring-1\b/)
    expect(cls).toMatch(/\bring-hue\/\d+\b/)
    // Not the wave-1 grey coin.
    expect(cls).not.toContain("bg-sidebar-accent")
  })

  it("gives the same person the same colour every time", () => {
    expect(getAvatarFallbackClass("Sam Rivera")).toBe(getAvatarFallbackClass("Sam Rivera"))
  })

  it("tells the demo's cast apart", () => {
    const hues = ["Sam Rivera", "Maya Chen", "Jonas Weber"].map((n) => /hue-(\w+)/.exec(getAvatarFallbackClass(n))![1])
    expect(new Set(hues).size).toBe(3)
  })

  it("lets a colour the person picked win", () => {
    expect(getAvatarFallbackClass("Sam Rivera", "berry")).toContain("hue-berry")
  })

  it("still answers with no name at all", () => {
    expect(getAvatarFallbackClass(undefined)).toContain("hue-sky")
  })
})
