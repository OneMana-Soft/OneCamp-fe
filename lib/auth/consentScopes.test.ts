import { describe, expect, it } from "vitest"
import { CONSENT_SCOPES, SCOPE_HUMAN_LABELS, changesThings, scopeWords } from "./consentScopes"

// The consent card is the most trust-critical page in the product (admin.md
// F9). A person deciding what an outside agent may do reads words, not
// identifiers: one scope used to show only "channels:read". Every scope the
// server can grant has a human label, and this fails when a new one arrives
// without.
describe("the consent card's scope words", () => {
  it("has a human label for every scope the server grants", () => {
    const missing = CONSENT_SCOPES.filter((s) => !SCOPE_HUMAN_LABELS[s])
    expect(missing, "scopes with no human label on the consent card").toEqual([])
    for (const s of CONSENT_SCOPES) {
      expect(scopeWords(s)).not.toContain(":")
      expect(scopeWords(s)).not.toBe(s)
    }
  })

  it("tags every write scope as changing things, and no read scope", () => {
    for (const s of CONSENT_SCOPES) expect(changesThings(s), s).toBe(s.endsWith(":write"))
  })

  it("still says something readable for a scope this build doesn't know", () => {
    expect(scopeWords("reports_beta:read")).toBe("Read reports beta")
    expect(scopeWords("boards:write")).toBe("Change boards")
  })
})
