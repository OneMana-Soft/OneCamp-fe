import { describe, expect, it } from "vitest"
import { pageOwnsBottomEdge } from "./mobileBottomNav"

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
