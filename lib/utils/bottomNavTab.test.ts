import { describe, expect, it } from "vitest"
import { bottomNavTab } from "@/lib/utils/mobileBottomNav"

const TABS = ["app/home", "app/channel", "app/chat", "app/activity"]

describe("bottomNavTab", () => {
  it("selects the tab whose section the page is in", () => {
    expect(bottomNavTab("/app/home", TABS)).toBe("app/home")
    expect(bottomNavTab("/app/chat/group/g1", TABS)).toBe("app/chat")
    expect(bottomNavTab("/app/activity?tab=ai", TABS)).toBe("app/activity")
  })
  it("selects More for pages reached through it", () => {
    expect(bottomNavTab("/app/myTask", TABS)).toBe("more")
    expect(bottomNavTab("/app/doc/d1", TABS)).toBe("more")
    // A prefix is not a section: /app/channelx is not under /app/channel.
    expect(bottomNavTab("/app/channelx", TABS)).toBe("more")
  })
})
