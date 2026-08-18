import { describe, expect, it } from "vitest"

import { apiUrl } from "./apiUrl"

/**
 * The shared base-URL join.
 *
 * Extracted from mcpEndpoint after the SCIM card copied its normalisation. These cases are the ones the
 * original comment named as real: the deployed NEXT_PUBLIC_BACKEND_URL ends in a slash, so anything
 * adding its own produces `//path`, which works behind one proxy and 404s behind the next. That is
 * invisible in review and invisible in a URL somebody pastes into an identity provider without reading.
 */
describe("apiUrl", () => {
  const BETA = "https://onecamp-backend.onemana.dev/"

  it("joins a base that ends in a slash without doubling it", () => {
    expect(apiUrl("scim/v2", BETA)).toBe("https://onecamp-backend.onemana.dev/scim/v2")
  })

  it("joins a base with no trailing slash", () => {
    expect(apiUrl("scim/v2", "https://onecamp-backend.onemana.dev")).toBe(
      "https://onecamp-backend.onemana.dev/scim/v2",
    )
  })

  it("collapses several trailing slashes", () => {
    expect(apiUrl("v1/mcp", "http://localhost:3000///")).toBe("http://localhost:3000/v1/mcp")
  })

  it("accepts a path with a leading slash, because both conventions exist in this codebase", () => {
    // The point of accepting either: a helper that silently mangles one of the two forms already in
    // use is worse than no helper, because the caller cannot tell from the call site which it wanted.
    expect(apiUrl("/scim/v2", BETA)).toBe("https://onecamp-backend.onemana.dev/scim/v2")
    expect(apiUrl("///scim/v2", BETA)).toBe("https://onecamp-backend.onemana.dev/scim/v2")
  })

  it("tolerates surrounding whitespace, which env files collect", () => {
    expect(apiUrl("  scim/v2  ", "  https://example.dev/  ")).toBe("https://example.dev/scim/v2")
  })

  it("returns an empty string rather than inventing a hostname", () => {
    // A plausible-looking wrong URL is worse than an obvious absence: the card omits its setup block
    // when this is empty, instead of showing an operator something to paste that cannot work.
    expect(apiUrl("scim/v2", undefined)).toBe("")
    expect(apiUrl("scim/v2", "")).toBe("")
    expect(apiUrl("scim/v2", "   ")).toBe("")
  })

  it("keeps a base that already has a path prefix", () => {
    // Some deployments sit behind a path-based proxy.
    expect(apiUrl("scim/v2", "https://example.dev/onecamp/")).toBe(
      "https://example.dev/onecamp/scim/v2",
    )
  })

  it("returns the bare root for an empty path rather than a trailing slash", () => {
    // Nothing needs this today, and it is pinned because the obvious implementation returns
    // "https://example.dev/" — which would reintroduce exactly the doubled separator this prevents at
    // the first caller that appended to the result.
    expect(apiUrl("", BETA)).toBe("https://onecamp-backend.onemana.dev")
    expect(apiUrl("   ", BETA)).toBe("https://onecamp-backend.onemana.dev")
  })
})
