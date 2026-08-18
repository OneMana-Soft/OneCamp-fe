import { describe, it, expect } from "vitest"
import { assertUnreachable } from "./assertUnreachable"

/**
 * The compile-time half of this helper is verified by tsc, not here — it was checked by deleting the
 * `totp_required` case from app/page.tsx, which produced
 *   TS2345: Argument of type '{ status: "totp_required"; ... }' is not assignable to parameter of type 'never'
 * and passed cleanly once the case was restored. A vitest file cannot assert that; it type-checks its own
 * source, so a genuinely unreachable call is untypeable by construction.
 *
 * What IS testable is the runtime path, which fires precisely when the types were wrong: an API sends a
 * status this build has never heard of. That is the case the helper exists to make loud, so it is the
 * case worth pinning.
 */
describe("assertUnreachable", () => {
  it("throws when a value the types called impossible arrives at runtime", () => {
    // Cast because that is exactly the situation being reproduced — a value outside the declared union,
    // as a server one version ahead of this build would send.
    const fromTheFuture = { status: "webauthn_required" } as unknown as never

    expect(() => assertUnreachable(fromTheFuture)).toThrow()
  })

  it("names the offending value so the log identifies which case was missed", () => {
    // A bare "unreachable" in production tells you nothing. The status has to be in the message,
    // otherwise diagnosing it means guessing which of several unions was involved.
    const unknownOutcome = { status: "webauthn_required" } as unknown as never

    expect(() => assertUnreachable(unknownOutcome, "login outcome")).toThrow(
      /Unhandled login outcome: .*webauthn_required/,
    )
  })

  it("falls back to a generic label rather than producing 'Unhandled undefined'", () => {
    const unknownOutcome = { status: "surprise" } as unknown as never

    expect(() => assertUnreachable(unknownOutcome)).toThrow(/Unhandled value: /)
  })

  it("survives a value JSON.stringify cannot render, instead of throwing the wrong error", () => {
    // A circular object would make JSON.stringify throw a TypeError from inside the error-construction
    // path. That would replace a precise "unhandled case" report with a confusing serialisation failure
    // at the exact moment someone is trying to understand an impossible state.
    const circular: Record<string, unknown> = { status: "loop" }
    circular.self = circular

    expect(() => assertUnreachable(circular as unknown as never, "login outcome")).toThrow(
      /Unhandled login outcome/,
    )
  })
})
