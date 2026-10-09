import { describe, expect, it } from "vitest"
import { profileFormSchema, profileNamesPayload, type SavedNames } from "./profileForm"

// The profile editor refused names that sign-up and identity providers
// produced, on every save, and resent the handle every time. A saved value is
// now accepted as it is, a changed one follows the rule, and the handle is
// sent only when it changes.

const legacy: SavedNames = { fullName: "sam_1a2b3", displayName: "sam_1a2b3", handle: "Sam Smith" }
const base = { jobTitle: "", hobbies: "", language: "en", status: true }

function check(saved: SavedNames, values: { fullName: string; displayName: string; handle: string }) {
  const r = profileFormSchema(saved).safeParse({ ...base, ...values })
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe("the profile editor's rules", () => {
  it("saves a profile whose names and handle predate the rules, untouched", () => {
    expect(check(legacy, { fullName: "sam_1a2b3", displayName: " sam_1a2b3 ", handle: "Sam Smith" })).toEqual([])
  })

  it("takes a name in any language, and refuses a new one the rule refuses", () => {
    expect(check(legacy, { fullName: "José Álvarez O'Brien", displayName: "priya.raman", handle: "Sam Smith" })).toEqual([])
    expect(check(legacy, { fullName: "sam_1a2b3", displayName: "<b>", handle: "Sam Smith" })).toEqual([
      expect.stringMatching(/^Display name can use letters/),
    ])
  })

  it("checks a changed handle by its own rule", () => {
    expect(check(legacy, { fullName: "sam_1a2b3", displayName: "sam_1a2b3", handle: "@Sam.Smith" })).toEqual([])
    expect(check(legacy, { fullName: "sam_1a2b3", displayName: "sam_1a2b3", handle: "sam jones" })).toEqual([
      expect.stringMatching(/^A handle can use/),
    ])
  })
})

describe("what a save sends", () => {
  it("leaves out a handle that did not change", () => {
    expect(profileNamesPayload({ fullName: "Sam", displayName: "Sam", handle: " @sam smith " }, { ...legacy, handle: "sam smith" }))
      .toEqual({ user_name: "Sam", user_full_name: "Sam" })
  })

  it("sends a changed handle as it is kept, and a name left empty as saved", () => {
    expect(profileNamesPayload({ fullName: "", displayName: "Sam", handle: "@Sam.Smith" }, legacy))
      .toEqual({ user_name: "Sam", user_full_name: "sam_1a2b3", user_handle: "sam.smith" })
  })
})
