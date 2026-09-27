import { describe, expect, it } from "vitest"
import { userDisplayName } from "@/lib/utils/userDisplayName"

describe("userDisplayName", () => {
  it("names a bot by the name it goes by, not its handle", () => {
    expect(userDisplayName({ user_name: "onecamp-ai", user_full_name: "OneCamp AI", is_bot: true })).toBe("OneCamp AI")
  })
  it("leaves people named as they always were", () => {
    expect(userDisplayName({ user_name: "akashc777", user_full_name: "Akash Hadagali" })).toBe("akashc777")
    expect(userDisplayName({ user_full_name: "Maya Chen" })).toBe("Maya Chen")
  })
  it("never throws on nothing", () => {
    expect(userDisplayName(null)).toBe("")
    expect(userDisplayName({ user_name: "onecamp-ai", is_bot: true })).toBe("onecamp-ai")
  })
})
