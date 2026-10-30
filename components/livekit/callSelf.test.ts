import { describe, expect, it } from "vitest"

import { callSelfOf, tileWho } from "./callSelf"

const token = (claims: Record<string, unknown>) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.c2ln`
const SAM = { identity: "0x2a", name: "Sam Rivera" }

// DB-27's should-fix: LiveKit names your own part only once the call connects, and your tile read "Guest" until then.
describe("who your own tile is while the call connects", () => {
  it("is who the call's token says: its sub and name", () => {
    expect(callSelfOf(token({ sub: "0x2a", name: "Sam Rivera", video: {} }))).toEqual(SAM)
    expect(callSelfOf(token({ sub: "guest-g1-x", name: "Guest: Priya" }))).toEqual({ identity: "guest-g1-x", name: "Guest: Priya" })
    expect(callSelfOf(token({ sub: "0x2a" }))).toEqual({ identity: "0x2a", name: "" })
  })

  it("is nobody without a token that names someone", () => {
    for (const t of [undefined, "", "not-a-token", token({ name: "Sam Rivera" }), token({ sub: 42 })]) expect(callSelfOf(t)).toBeNull()
  })

  it("takes the token's only for your own part before LiveKit names it", () => {
    expect(tileWho({ identity: "", name: "", isLocal: true }, SAM)).toEqual(SAM)
    // Named by LiveKit: LiveKit's, even if it differs.
    expect(tileWho({ identity: "0x2a", name: "Sam R.", isLocal: true }, SAM)).toEqual({ identity: "0x2a", name: "Sam R." })
    // Someone else's part is never you, named or not.
    expect(tileWho({ identity: "", name: "", isLocal: false }, SAM)).toEqual({ identity: "", name: "" })
    expect(tileWho({ identity: "0x7", name: "Priya Shah", isLocal: false }, SAM)).toEqual({ identity: "0x7", name: "Priya Shah" })
    // No token (a board's own stage, say): LiveKit's.
    expect(tileWho({ identity: "", name: "", isLocal: true }, null)).toEqual({ identity: "", name: "" })
  })
})
