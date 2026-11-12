import { describe, expect, it } from "vitest"
import { askAdmin, planName, removeLimit, UNLOCK_CONTROLS } from "./planWords"
import { planHref } from "./planHref"

const links = {
  licence: "https://shop.example/buy?plan=lifetime",
  cloud: "https://shop.example/buy?plan=cloud",
  account: "https://shop.example/account",
  pricing: "https://shop.example/pricing",
}

describe("the plan's words", () => {
  it("removeLimit says the server's number, never a typed one", () => {
    expect(removeLimit(25)).toBe("Remove the 25-person limit")
    expect(removeLimit(30)).toBe("Remove the 30-person limit")
    expect(askAdmin(25)).toBe("Ask an admin to remove the 25-person limit.")
  })

  it("planName covers every kind", () => {
    expect(planName("free")).toBe("Free")
    expect(planName("licensed")).toBe("Licensed")
    expect(planName("cloud")).toBe("OneCamp Cloud")
    expect(planName("source")).toBe("Built from source")
  })

  it("names one way to company controls", () => {
    expect(UNLOCK_CONTROLS).toBe("Unlock company controls")
  })

  it("sends an admin to the licence the server names, or nowhere when it named none", () => {
    expect(planHref(links)).toBe(links.licence)
    expect(planHref(undefined)).toBeUndefined()
  })
})
