import { describe, expect, it } from "vitest"
import { composeRequested, isChannelPage, landingPath } from "./landing"

describe("where a new member lands", () => {
  it("takes the channel the server put them in", () => {
    expect(landingPath("/app/channel/6f1c3a52?compose=1")).toBe("/app/channel/6f1c3a52?compose=1")
  })

  it("never leaves the app, whatever the answer says", () => {
    for (const bad of ["https://evil.example/app", "//evil.example/app", "/login", "/app\\..\\x", "/app/ch annel", "", null, 42]) {
      expect(landingPath(bad)).toBeNull()
    }
  })
})

describe("a channel opened to write in", () => {
  it("is asked for by compose=1 only", () => {
    expect(composeRequested(new URLSearchParams("compose=1"))).toBe(true)
    expect(composeRequested(new URLSearchParams("compose=0"))).toBe(false)
    expect(composeRequested(new URLSearchParams(""))).toBe(false)
  })

  it("applies to that channel's own page", () => {
    expect(isChannelPage("/app/channel/abc", "abc")).toBe(true)
    expect(isChannelPage("/app/channel/abc", "xyz")).toBe(false)
    expect(isChannelPage("/app/doc/abc", "abc")).toBe(false)
    expect(isChannelPage(null, "abc")).toBe(false)
  })
})
