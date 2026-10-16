import { describe, expect, it } from "vitest"
import { PRESENCE_WORDS, presenceOf } from "./presence"

// A DM's header said "Offline" on a computer and "Away" on a phone for the
// same person, whose status was online with no device connected (QA F-18).
// One rule says where someone is, wherever it is said.
describe("where a person is", () => {
  it("is active only when online on a device", () => {
    expect(presenceOf({ status: "online", deviceConnected: 1 }, undefined)).toBe("active")
    expect(presenceOf({ status: "online", deviceConnected: 0 }, undefined)).toBe("offline")
  })

  it("reads the profile until the live state has loaded", () => {
    const profile = { user_status: "online", user_device_connected: 2 }
    expect(presenceOf({ status: "offline", deviceConnected: -1 }, profile)).toBe("active")
    expect(presenceOf(undefined, { user_status: "online", user_device_connected: 0 })).toBe("offline")
    expect(presenceOf(undefined, undefined)).toBe("offline")
  })

  it("is away when they said so", () => {
    expect(presenceOf({ status: "away", deviceConnected: 1 }, undefined)).toBe("away")
  })

  it("is said in the same words on a computer and a phone", () => {
    expect(PRESENCE_WORDS).toEqual({ active: "Active", away: "Away", offline: "Offline" })
  })
})
