import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The invitations card promised "a magic link", which is not what an
// invitation is: a link, good for seven days, to join the workspace. Design
// v3 moved the section's line to the page header (lib/adminSections), so the
// card says it where it matters: the first-run welcome and each row's expiry.
describe("the invitations card", () => {
  it("says what an invitation is, and never a magic link", () => {
    const src = readFileSync(resolve(__dirname, "invitationCard.tsx"), "utf8")
    expect(src).not.toMatch(/magic link/i)
    expect(src).toContain('title="Bring your team in"')
    expect(src).toContain("They land in #general, ready to say hello.")
  })
})
