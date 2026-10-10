import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { SIDEBAR_MIN_PX, SIDEBAR_RAIL_PX, sidebarSizes, startsAsRail } from "./sidebarSize"

// The sidebar sized in percent was 123px on a 768px tablet (every name cut
// to a few letters) with a 31px rail. Its floors are pixels now.

const px = (percent: number, width: number) => (percent / 100) * width

describe("sidebarSizes", () => {
  it("keeps a tablet's sidebar readable and its rail wide enough for its icons", () => {
    for (const width of [768, 820, 1024]) {
      const s = sidebarSizes(width)
      expect(px(s.min, width), `${width}`).toBeGreaterThanOrEqual(SIDEBAR_MIN_PX)
      expect(px(s.rail, width), `${width}`).toBeGreaterThanOrEqual(SIDEBAR_RAIL_PX)
      expect(s.max).toBeGreaterThanOrEqual(s.min)
    }
  })

  it("leaves a desktop as it was", () => {
    expect(sidebarSizes(1440)).toEqual({ min: 15, max: 18, rail: 4 })
    expect(sidebarSizes(1920)).toEqual({ min: 15, max: 18, rail: 4 })
  })

  it("starts as the rail on a tablet, open on a desktop", () => {
    expect(startsAsRail(768)).toBe(true)
    expect(startsAsRail(1023)).toBe(true)
    expect(startsAsRail(1024)).toBe(false)
    expect(startsAsRail(1440)).toBe(false)
  })

  it("is what the desktop shell's sidebar uses", () => {
    const nav = readFileSync("components/navigationBar/desktop/desktopNavigationBar.tsx", "utf8")
    expect(nav).toContain("minSize={sizes.min}")
    expect(nav).toContain("maxSize={sizes.max}")
    expect(nav).toContain("const navCollapsedSize = sizes.rail;")
    expect(nav).toContain("startsAsRail(window.innerWidth)")
    expect(nav).not.toMatch(/minSize=\{15\}|maxSize=\{18\}/)
  })
})
