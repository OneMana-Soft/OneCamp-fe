import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { secretMoves, secretReentryHint } from "./secretDestination"

// The backend's cases (helpers/testdata/secret_destination.json), copied here:
// the form must ask for the secret again exactly when the server would refuse
// to keep it.
interface Case {
  why: string
  from: string
  to: string
  fromHow?: string[]
  toHow?: string[]
  moves: boolean
}

// The backend's copy (helpers/testdata/secret_destination.json) must stay
// byte-identical to this one; the file says so itself.
const shared: { about: string; cases: Case[] } = JSON.parse(
  readFileSync(join(process.cwd(), "testdata/secret_destination.json"), "utf8"),
)
const cases = shared.cases

describe("a stored secret stays with its address", () => {
  it("has the backend's cases, and says the two copies are one list", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10)
    expect(shared.about).toContain("byte-identical")
  })
  for (const c of cases) {
    it(c.why, () => {
      expect(secretMoves({ url: c.from, how: c.fromHow }, { url: c.to, how: c.toHow })).toBe(c.moves)
    })
  }
  it("says what to do in the form's words", () => {
    expect(secretReentryHint()).toBe("Enter the token again for the new address.")
    expect(secretReentryHint("secret")).toBe("Enter the secret again for the new address.")
  })
})
