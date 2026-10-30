import { describe, expect, it } from "vitest"

import {
  placeReach,
  placeTitle,
  readAppAccess,
  sameScopes,
  withPlace,
  withoutPlace,
  type AppAudience,
} from "@/components/admin/appAccess"

// What Admin › Apps says of an app's access (platform P-API, §3.1): where it
// may reach, named only for an admin who may open it, and whether the app's
// own user may open each place.

const DOC = "7d1e5c2a-9b3f-4a6e-8c1d-2f4b6a8e0c3d"
const TABLE = "0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a0b"

describe("an app's places", () => {
  it("are named by their title, a table by the admin's own list, else by what they are", () => {
    expect(placeTitle({ kind: "doc", id: DOC, title: "Launch notes" })).toBe("Launch notes")
    expect(placeTitle({ kind: "table", id: TABLE }, new Map([[TABLE, "Vendors"]]))).toBe("Vendors")
    expect(placeTitle({ kind: "doc", id: DOC })).toBe("A doc you can't open")
    expect(placeTitle({ kind: "table", id: TABLE }, new Map())).toBe("A table you can't open")
  })

  it("say whether the app's user may open them, and nothing where nothing decides it", () => {
    expect(placeReach({ kind: "doc", id: DOC, app_opens: true })).toEqual({ tone: "success", word: "Its user can open it" })
    expect(placeReach({ kind: "doc", id: DOC, app_opens: false })).toEqual({ tone: "warning", word: "Its user can't open it" })
    expect(placeReach({ kind: "table", id: TABLE })).toBeNull()
  })

  it("are added once and removed, whatever the id's case", () => {
    const none: AppAudience = { places: [], public: false }
    const one = withPlace(none, { kind: "doc", id: DOC, title: "Launch notes" })
    expect(one.places).toHaveLength(1)
    expect(withPlace(one, { kind: "doc", id: DOC.toUpperCase() })).toBe(one)
    // The same id of another kind is another place.
    expect(withPlace(one, { kind: "table", id: DOC }).places).toHaveLength(2)
    expect(withoutPlace(one, { kind: "doc", id: DOC.toUpperCase() }).places).toEqual([])
  })
})

describe("the identity read", () => {
  it("is read whatever came back", () => {
    expect(readAppAccess(undefined)).toBeNull()
    expect(readAppAccess({ data: {} })).toBeNull()
    const read = readAppAccess({ data: { identity: { app_id: "a1", slug: "deploys", name: "Deploys", enabled: true }, tokens: [null, { id: "t1" }] } })
    expect(read?.identity.scopes).toEqual([])
    expect(read?.identity.audience).toEqual({ places: [], public: false })
    expect(read?.tokens.map((t) => t.id)).toEqual(["t1"])
  })
})

describe("a change of scopes", () => {
  it("is a change only when the set differs", () => {
    expect(sameScopes(["tasks:read", "docs:read"], ["docs:read", "tasks:read"])).toBe(true)
    expect(sameScopes(["tasks:read"], ["tasks:read", "docs:read"])).toBe(false)
    expect(sameScopes(["tasks:read"], ["docs:read"])).toBe(false)
  })
})
