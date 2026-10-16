import { describe, expect, it } from "vitest"
import { PANEL_BESIDE_FROM_PX, isTabletBand, rightPanelPlacement, shellBand } from "./shellBand"

// Design v3, mobile T1: the width says how much room, the pointer how big a
// target must be. A tablet rendered the desktop shell at mouse sizes.
describe("the shell's bands", () => {
  it("are the phone below 640, whatever the pointer", () => {
    expect(shellBand(390, true)).toBe("phone")
    expect(shellBand(639, false)).toBe("phone")
  })

  it("are a tablet from 640 to 1279 under a finger: compact below 1024, wide from it", () => {
    expect(shellBand(640, true)).toBe("tablet-compact")
    expect(shellBand(768, true)).toBe("tablet-compact")
    expect(shellBand(1023, true)).toBe("tablet-compact")
    expect(shellBand(1024, true)).toBe("tablet-wide")
    expect(shellBand(1279, true)).toBe("tablet-wide")
  })

  it("are the desktop from 1280, and at any width with a fine pointer", () => {
    expect(shellBand(1280, true)).toBe("desktop")
    expect(shellBand(1366, true)).toBe("desktop")
    expect(shellBand(768, false)).toBe("desktop")
    expect(shellBand(1024, false)).toBe("desktop")
  })

  it("name the two tablet shells", () => {
    expect(isTabletBand("tablet-compact")).toBe(true)
    expect(isTabletBand("tablet-wide")).toBe(true)
    expect(isTabletBand("desktop")).toBe(false)
    expect(isTabletBand("phone")).toBe(false)
  })
})

// Chat critic: an open thread at 1024 squeezed the conversation to about
// 360px, at 768 to about 165. Below 1100 the panel opens over the page.
describe("where the right panel opens", () => {
  it("is over the page in a narrow window, at 1024 and at 768", () => {
    expect(rightPanelPlacement(1024, shellBand(1024, false))).toBe("over")
    expect(rightPanelPlacement(768, shellBand(768, false))).toBe("over")
    expect(rightPanelPlacement(PANEL_BESIDE_FROM_PX - 1, "desktop")).toBe("over")
  })

  it("is beside the page from 1100 up, and always over it on a tablet", () => {
    expect(rightPanelPlacement(PANEL_BESIDE_FROM_PX, "desktop")).toBe("beside")
    expect(rightPanelPlacement(1440, shellBand(1440, false))).toBe("beside")
    expect(rightPanelPlacement(1200, shellBand(1200, true))).toBe("over")
  })
})
