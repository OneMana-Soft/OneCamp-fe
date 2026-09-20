import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"

// Source-level guard rather than a render test. The page needs a router, a
// session probe and a live /auth/providers response to mount, and what matters
// here is the SHAPE of the gate, which a render test would not pin.
const src = readFileSync("app/page.tsx", "utf8")

describe("demo auto-start", () => {
  it("starts the demo when the marketing site asks it to", () => {
    expect(src).toContain("DEMO_START_PARAM")
    expect(src).toContain('const DEMO_START_PARAM = "start_demo"')
  })

  // THE SECURITY PROPERTY. A customer's own install must ignore this entirely.
  // isDemoEnabled comes from /auth/providers, so the server decides; the URL
  // alone must never be able to mint a session. If this gate is ever dropped,
  // a self-hosted deployment would honour a parameter from any inbound link.
  it("is gated on the server saying demo login exists", () => {
    // Pin the GUARD, not the mere presence of the name. isDemoEnabled also
    // appears in the effect's dependency array, so a "does the slice mention
    // it" assertion passes even after the early return stops checking it.
    // That is not hypothetical: the first version of this test did exactly
    // that and survived deleting the gate.
    expect(src).toMatch(
      /if\s*\(\s*isChecking\s*\|\|\s*!isDemoEnabled\s*\|\|\s*autoDemoStarted\.current\s*\)\s*return;/,
    )
  })

  // Must not race the session probe. A visitor who is already signed in gets
  // redirected while isChecking is still true; acting before that resolves
  // could drop a real user into the shared demo account.
  it("waits for the session probe to finish", () => {
    // Same reasoning as above: assert the early return, not the identifier.
    expect(src).toMatch(/if\s*\(\s*isChecking\s*\|\|/)
  })

  // One shot. Without the guard the effect re-fires on every dependency change
  // and issues repeated demo logins.
  it("only ever fires once", () => {
    expect(src).toContain("autoDemoStarted.current = true")
  })

  // A failed demo login must fall back to the ordinary page so the error is
  // visible, rather than spinning forever behind the loading screen.
  it("shows the loading screen only while the attempt is in flight", () => {
    expect(src).toContain("autoDemo && isDemoLoading")
  })

  // House style: no em dashes in user-facing copy.
  it("uses no em dash in the demo button", () => {
    const button = src.slice(src.indexOf("Try the demo"), src.indexOf("Try the demo") + 80)
    expect(button).not.toMatch(/[—–]/)
  })
})
