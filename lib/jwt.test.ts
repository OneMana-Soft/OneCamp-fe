import { describe, expect, it } from "vitest"

import { jwtClaims } from "./jwt"

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url")
const jwt = (payload: string) => `eyJhbGciOiJIUzI1NiJ9.${b64url(payload)}.c2ln`

describe("a JWT's claims", () => {
  it("reads them, a name in any script whole", () => {
    expect(jwtClaims(jwt(JSON.stringify({ sub: "0x2a", name: "Zoë Ångström 李", exp: 1_800_000_000 })))).toEqual({
      sub: "0x2a",
      name: "Zoë Ångström 李",
      exp: 1_800_000_000,
    })
  })

  it("is null for a token it can't read", () => {
    for (const t of ["", "abc", "a.!!!.c", jwt("not json"), jwt("[1,2]"), jwt("7"), jwt("null")]) expect(jwtClaims(t), t).toBeNull()
  })
})
