import { describe, expect, it } from "vitest"
import { errorToastCopy, shownRecently } from "./errorToast"

describe("errorToastCopy", () => {
  it("prefers the server's own words", () => {
    expect(errorToastCopy(400, "Channel name is taken")).toEqual({ title: "That didn't work", description: "Channel name is taken" })
  })
  it("explains a status in plain words, never the transport's message", () => {
    expect(errorToastCopy(403, undefined).description).toBe("You don't have permission to do that.")
    expect(errorToastCopy(502, "").title).toBe("Something went wrong")
    expect(JSON.stringify(errorToastCopy(418, undefined))).not.toMatch(/status code|In-App/)
  })
})

describe("shownRecently", () => {
  it("collapses the same toast raised several times at once", () => {
    const copy = { title: "Not allowed", description: "x-unique-for-test" }
    expect(shownRecently(copy, 1000)).toBe(false)
    expect(shownRecently(copy, 2000)).toBe(true)
    expect(shownRecently(copy, 9000)).toBe(false)
  })
})

describe("a bare refusal from the server", () => {
  it("is replaced by the status's own words", () => {
    for (const msg of ["Not Authorised", "not authorized", "Unauthorized", "Forbidden."]) {
      expect(errorToastCopy(403, msg)).toEqual({ title: "Not allowed", description: "You don't have permission to do that." })
    }
  })

  it("leaves a message that explains itself alone", () => {
    expect(errorToastCopy(403, "Only workspace admins can create teams.").description).toBe("Only workspace admins can create teams.")
  })
})
