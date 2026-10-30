import { afterEach, describe, expect, it } from "vitest"
import { AFTER_SIGN_IN_MAX_MS, rememberAfterSignIn, resumePath, takeAfterSignIn } from "@/lib/afterSignIn"

// Something started while signed out, carried on after sign-in. The connect
// cases were lib/pendingConnect's own tests ("comes back once", "never
// becomes a redirect somewhere else"), kept here with the same expectations.

const REQ = "3f2a4c1e-9b7d-4e2a-8c1f-0a1b2c3d4e5f"
const T0 = 1_000_000_000_000

describe("carrying on after sign-in", () => {
  afterEach(() => sessionStorage.clear())

  it("comes back once, for an outside agent's sign-in", () => {
    rememberAfterSignIn({ kind: "connect", id: REQ }, T0)
    expect(takeAfterSignIn(T0 + 1000)).toBe(`/connect/authorize?request=${REQ}`)
    expect(takeAfterSignIn(T0 + 2000)).toBeNull()
  })

  it("comes back to a published page's copy, with a password page's unlock", () => {
    rememberAfterSignIn({ kind: "copyPage", slug: "launch-notes", k: "3.99.sig" }, T0)
    expect(takeAfterSignIn(T0 + 1000)).toBe("/p/launch-notes?copy=1&k=3.99.sig")
    rememberAfterSignIn({ kind: "copyPage", slug: "launch-notes", k: null }, T0)
    expect(takeAfterSignIn(T0 + 1000)).toBe("/p/launch-notes?copy=1")
  })

  it("keeps only the latest thing asked for", () => {
    rememberAfterSignIn({ kind: "connect", id: REQ }, T0)
    rememberAfterSignIn({ kind: "copyPage", slug: "launch-notes" }, T0)
    expect(takeAfterSignIn(T0 + 1000)).toBe("/p/launch-notes?copy=1")
  })

  it("never becomes a redirect somewhere else", () => {
    rememberAfterSignIn({ kind: "connect", id: "https://evil.example" }, T0)
    expect(takeAfterSignIn(T0)).toBeNull()
    rememberAfterSignIn({ kind: "copyPage", slug: "../../logout" }, T0)
    expect(takeAfterSignIn(T0)).toBeNull()
    rememberAfterSignIn({ kind: "copyPage", slug: "ok", k: "x&next=//evil.example" }, T0)
    expect(takeAfterSignIn(T0)).toBeNull()
    for (const planted of ["//evil.example", JSON.stringify({ kind: "connect", id: "//evil.example", at: T0 }), JSON.stringify({ kind: "path", to: "https://evil.example", at: T0 }), "{"]) {
      sessionStorage.setItem("oc.afterSignIn", planted)
      expect(takeAfterSignIn(T0)).toBeNull()
    }
    expect(resumePath({ kind: "copyPage", slug: "a".repeat(65) })).toBeNull()
  })

  it("lets go of anything older than half an hour, or stamped in the future", () => {
    rememberAfterSignIn({ kind: "copyPage", slug: "launch-notes" }, T0)
    expect(takeAfterSignIn(T0 + AFTER_SIGN_IN_MAX_MS + 1)).toBeNull()
    rememberAfterSignIn({ kind: "copyPage", slug: "launch-notes" }, T0 + 10 * 60_000)
    expect(takeAfterSignIn(T0)).toBeNull()
  })
})
