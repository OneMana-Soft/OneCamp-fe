import { describe, expect, it } from "vitest"
import { DEMO_REFUSAL_TITLE, errorToastCopy, isDemoRefusal, shownRecently } from "./errorToast"

describe("errorToastCopy", () => {
  it("prefers the server's own words", () => {
    expect(errorToastCopy(400, "Channel name is taken")).toEqual({ title: "That didn't work", description: "Channel name is taken" })
  })
  it("explains a status in plain words, never the transport's message", () => {
    expect(errorToastCopy(403, undefined).description).toBe("You don't have permission to do that.")
    expect(errorToastCopy(502, "").title).toBe("Something went wrong")
    expect(JSON.stringify(errorToastCopy(418, undefined))).not.toMatch(/status code|In-App/)
  })
  // QA DSA-15: "Something went wrong · Failed to create comment".
  it("never shows a server fault's developer text", () => {
    expect(errorToastCopy(500, "Failed to create comment")).toEqual({ title: "Something went wrong", description: "The server hit a problem. Try again in a moment." })
    expect(errorToastCopy(500, "Couldn't save the form just now. Try again in a moment.").description).toBe("Couldn't save the form just now. Try again in a moment.")
    expect(errorToastCopy(400, "Failed to read the date: use YYYY-MM-DD.").description).toBe("Failed to read the date: use YYYY-MM-DD.")
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

describe("the demo explaining itself", () => {
  const why = "Everyone who opens the demo shares this, so it can't be archived or deleted here."

  it("keeps the server's words and says it is the demo, not a missing permission", () => {
    expect(errorToastCopy(403, why, "demo")).toEqual({ title: DEMO_REFUSAL_TITLE, description: why })
  })

  it("falls back to the status's words when it says nothing", () => {
    expect(errorToastCopy(403, "", "demo")).toEqual({ title: "Not allowed", description: "You don't have permission to do that." })
  })

  it("is recognised only by its code", () => {
    expect(isDemoRefusal({ code: "demo", msg: why })).toBe(true)
    for (const v of [undefined, null, "demo", { code: "nope" }, { msg: why }]) expect(isDemoRefusal(v)).toBe(false)
  })
})
