import { describe, expect, it } from "vitest"
import { capLine, expiryOptions } from "@/components/guest/GuestLinkSection"

// The lifetimes a new link may have under the workspace's longest (docs C6-2).
describe("a new link's lifetime under the workspace's longest", () => {
  it("offers everything, never-ending included, when there's no limit", () => {
    expect(expiryOptions(0).map((o) => o.label)).toEqual(["7 days", "14 days", "30 days", "90 days", "Does not expire"])
    expect(expiryOptions(undefined)).toHaveLength(5)
    expect(capLine(0)).toBe("")
  })

  it("offers nothing past the limit, never a link that doesn't end, and the limit itself", () => {
    expect(expiryOptions(30).map((o) => o.label)).toEqual(["7 days", "14 days", "30 days"])
    expect(expiryOptions(45).map((o) => o.label)).toEqual(["7 days", "14 days", "30 days", "45 days"])
    expect(expiryOptions(1).map((o) => o.label)).toEqual(["1 day"])
    expect(expiryOptions(365).map((o) => o.label)).toEqual(["7 days", "14 days", "30 days", "90 days", "1 year"])
    expect(capLine(30)).toBe("Links in this workspace last at most 30 days.")
    expect(capLine(365)).toBe("Links in this workspace last at most 1 year.")
  })
})
