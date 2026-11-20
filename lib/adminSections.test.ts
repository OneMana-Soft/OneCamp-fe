import { describe, expect, it } from "vitest"
import { SETTINGS_PLACES } from "./adminSections"

// ADMIN-31: Invitations promised "the link that brings people in", a
// reusable join link that doesn't exist; each invitation has its own link.
describe("the settings map", () => {
  it("Invitations promises only what exists", () => {
    const invitations = SETTINGS_PLACES.find((p) => p.key === "invitations")
    expect(invitations?.description).toBe("Who has been asked in, and each person's link.")
  })
})
