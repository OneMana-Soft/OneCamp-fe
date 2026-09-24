import { describe, expect, it } from "vitest"
import { jwtExpiry, tokenStillFresh } from "./collabToken"

const jwt = (payload: object) =>
  ["e30", btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"), "sig"].join(".")

describe("collab token reuse", () => {
  it("reads the expiry a JWT carries", () => {
    expect(jwtExpiry(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000)
  })

  it("treats anything unreadable as unusable, so it is fetched again", () => {
    for (const t of ["", "not-a-jwt", "a.%%%.c", jwt({ sub: "x" })]) {
      expect(tokenStillFresh(t, 0)).toBe(false)
    }
  })

  it("reuses a token only while it has more than a minute left", () => {
    const t = jwt({ exp: 1000 })
    expect(tokenStillFresh(t, 900)).toBe(true)
    expect(tokenStillFresh(t, 941)).toBe(false)
    expect(tokenStillFresh(t, 1000)).toBe(false)
  })
})
