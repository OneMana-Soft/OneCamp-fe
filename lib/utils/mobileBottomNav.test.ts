import { describe, expect, it } from "vitest"
import { bottomNavTab, pageOwnsBottomEdge } from "./mobileBottomNav"

describe("pageOwnsBottomEdge", () => {
  it("is true where a composer, toolbar or action row sits on the bottom edge", () => {
    for (const p of ["/app/channel/abc", "/app/chat/abc", "/app/doc/abc", "/app/task/abc", "/app/meet/x", "/app/calendar/event/x"]) {
      expect(pageOwnsBottomEdge(p), p).toBe(true)
    }
  })
  it("keeps the navigation on lists and settings", () => {
    for (const p of ["/app/home", "/app/channel", "/app/doc", "/app/myTask", "/app/settings/agents", "/app/calendar"]) {
      expect(pageOwnsBottomEdge(p), p).toBe(false)
    }
  })
})

describe("bottomNavTab", () => {
  const TABS = ["app/home", "app/channel", "app/chat", "app/inbox"]
  it("is the tab a page lives under, More for the places More holds", () => {
    expect(bottomNavTab("/app/channel/abc", TABS)).toBe("app/channel")
    expect(bottomNavTab("/app/myTask", TABS)).toBe("more")
    expect(bottomNavTab("/app/settings/agents", TABS)).toBe("more")
  })
  // A 404 marked More as the current place, as if the page lived there.
  it("is no tab at all for an address no route answers", () => {
    expect(bottomNavTab("/app/this-page-wandered-off", TABS)).toBe("")
  })
})
