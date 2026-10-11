import { describe, expect, it } from "vitest"
import {
  SIDEBAR_DEFAULT_PX,
  SIDEBAR_MAX_PX,
  SIDEBAR_MIN_PX,
  atSidebarBound,
  clampSidebarWidth,
  savedSidebar,
  startsAsRail,
} from "./sidebarSize"

// Design v3 (shell S2): the sidebar is held in pixels, 248 by default and
// 216 to 320 when dragged. As a percentage it drifted with the window and was
// 123px on a 768px tablet.

describe("the sidebar's width", () => {
  it("is 248 by default, and holds to 216 and 320", () => {
    expect(SIDEBAR_DEFAULT_PX).toBe(248)
    expect(clampSidebarWidth(216)).toBe(216)
    expect(clampSidebarWidth(248)).toBe(248)
    expect(clampSidebarWidth(320)).toBe(320)
    expect(clampSidebarWidth(150)).toBe(SIDEBAR_MIN_PX)
    expect(clampSidebarWidth(600)).toBe(SIDEBAR_MAX_PX)
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_PX)
  })

  it("says when a drag asks past a bound, for the handle's shake", () => {
    expect(atSidebarBound(200)).toBe("min")
    expect(atSidebarBound(330)).toBe("max")
    expect(atSidebarBound(264)).toBeNull()
  })

  it("is the same width whatever the window: pixels, not percent", () => {
    const at = (w: number) => savedSidebar("onecamp-sidebar-width=264", w).width
    expect(at(1024)).toBe(264)
    expect(at(1440)).toBe(264)
    expect(at(1920)).toBe(264)
  })

  it("comes back as it was left, and starts as the rail on a tablet when nobody chose", () => {
    expect(savedSidebar("", 1440)).toEqual({ width: 248, collapsed: false })
    expect(savedSidebar("", 768)).toEqual({ width: 248, collapsed: true })
    expect(savedSidebar("react-resizable-root-panels:collapsed=false", 768).collapsed).toBe(false)
    expect(savedSidebar("a=1; react-resizable-root-panels:collapsed=true", 1440).collapsed).toBe(true)
    expect(savedSidebar("onecamp-sidebar-width=9999", 1440).width).toBe(320)
  })

  it("starts as the rail below 1024, open from 1024", () => {
    expect(startsAsRail(768)).toBe(true)
    expect(startsAsRail(1023)).toBe(true)
    expect(startsAsRail(1024)).toBe(false)
    expect(startsAsRail(1440)).toBe(false)
  })
})
