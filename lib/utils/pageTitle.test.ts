import { describe, expect, it } from "vitest"
import { pageTitle } from "@/lib/utils/pageTitle"

describe("pageTitle", () => {
  const lookups = { channels: { c1: "design" }, docs: { d1: "Launch sync notes" }, people: { u1: "Maya Chen" } }
  it("names the page from what the sidebar knows", () => {
    expect(pageTitle("/app/channel/c1", lookups)).toBe("#design · OneCamp")
    expect(pageTitle("/app/doc/d1?tab=history", lookups)).toBe("Launch sync notes · OneCamp")
    expect(pageTitle("/app/chat/u1", lookups)).toBe("Maya Chen · OneCamp")
    expect(pageTitle("/app/chat/group/g1", lookups)).toBe("Group chat · OneCamp")
  })
  it("falls back to the section, and to the product", () => {
    expect(pageTitle("/app/channel/unknown", lookups)).toBe("Channels · OneCamp")
    expect(pageTitle("/app/myTask")).toBe("My Tasks · OneCamp")
    expect(pageTitle("/app/something-new")).toBe("OneCamp")
  })
  it("counts what is waiting for you", () => {
    expect(pageTitle("/app/home", {}, 3)).toBe("(3) Home · OneCamp")
    expect(pageTitle("/app/home", {}, 250)).toBe("(99+) Home · OneCamp")
  })
})
