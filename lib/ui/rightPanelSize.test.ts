import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { RIGHT_PANEL_MIN_PX, rightPanelMinSize } from "./rightPanelSize"

describe("the right panel's minimum size", () => {
  it("is 32% where that is wide enough", () => {
    expect(rightPanelMinSize(1400)).toBe(32)
    expect(rightPanelMinSize(1000)).toBe(32)
  })

  it("is what 320px takes on a narrower screen, so the content is never cut off", () => {
    // A 1024px screen: the panel group is about 845px beside the sidebar.
    const min = rightPanelMinSize(845)
    expect(min).toBeGreaterThan(32)
    expect((min / 100) * 845).toBeGreaterThanOrEqual(RIGHT_PANEL_MIN_PX)
  })

  it("stops at the panel's 60% maximum, and is 32% before the group is measured", () => {
    expect(rightPanelMinSize(400)).toBe(60)
    expect(rightPanelMinSize(0)).toBe(32)
    expect(rightPanelMinSize(Number.NaN)).toBe(32)
  })

  it("matches the width the panel's content is laid out at", () => {
    const layout = readFileSync(join(__dirname, "..", "..", "app", "app", "LayoutContent.tsx"), "utf8")
    expect(layout).toContain(`min-w-[${RIGHT_PANEL_MIN_PX}px]`)
    expect(layout).toMatch(/minSize=\{rightMin\}/)
  })
})
