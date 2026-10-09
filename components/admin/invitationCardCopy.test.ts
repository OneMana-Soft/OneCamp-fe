import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The invitations card promised "a magic link", which is not what an
// invitation is: a link, good for seven days, to join the workspace.
describe("the invitations card", () => {
  it("says what an invitation is", () => {
    const src = readFileSync(resolve(__dirname, "invitationCard.tsx"), "utf8")
    expect(src).not.toMatch(/magic link/i)
    expect(src).toContain("Each invitation is a link, good for seven days, that lets them join this workspace.")
  })
})
