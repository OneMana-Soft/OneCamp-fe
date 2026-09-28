import { describe, expect, it } from "vitest"
import { isCurrentPath } from "@/lib/utils/isCurrentPath"

describe("isCurrentPath", () => {
  it("matches the page you are on, whatever the slashes and query", () => {
    expect(isCurrentPath("/app/channel/x", "/app/channel/x")).toBe(true)
    expect(isCurrentPath("/app/channel/x/", "app/channel/x")).toBe(true)
    expect(isCurrentPath("/app/doc/x", "/app/doc/x?tab=history#h2")).toBe(true)
  })
  it("does not match another page, a parent or an empty link", () => {
    expect(isCurrentPath("/app/channel/x", "/app/channel/y")).toBe(false)
    expect(isCurrentPath("/app/channel/x", "/app/channel")).toBe(false)
    expect(isCurrentPath("/app/channel/x", "")).toBe(false)
  })
})
