import { describe, expect, it } from "vitest"
import { stampedEditor } from "./stamp"

// Only an editor presents, holds everyone or brings everyone (main's ruling, 1 Nov). The relay stamps each person's
// user with edit from the member list (the collaboration service's presenceGuard.js), and a tab claims nothing there.
describe("who the relay says may edit", () => {
  it("is only a state whose user the relay stamped edit: true", () => {
    expect(stampedEditor({ user: { id: "u-ann", name: "Ann Lee", edit: true } })).toBe(true)
    for (const s of [{ user: { id: "u-vic", name: "Vic", edit: false } }, { user: { id: "u-vic", name: "Vic" } }, { user: { edit: "true" } }, { user: { edit: 1 } }, { user: null }, { user: "edit" }, { edit: true }, {}, null, undefined, "edit"]) {
      expect(stampedEditor(s), JSON.stringify(s)).toBe(false)
    }
  })
})
