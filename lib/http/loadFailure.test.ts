import { describe, expect, it } from "vitest"

import { failureWords, loadFailure } from "./loadFailure"

describe("loadFailure", () => {
  it("is no-access when the server says it is there and not this person's", () => {
    expect(loadFailure({ response: { status: 403 } })).toBe("no-access")
  })
  it("is gone when the server says there is nothing by that id, or answered with nothing", () => {
    expect(loadFailure({ response: { status: 404 } })).toBe("gone")
    expect(loadFailure({ response: { status: 410 } })).toBe("gone")
    // A read by id answers 400 for an id that names nothing (a malformed one):
    // Try again could never fix it (PTC-4 read "a connection problem").
    expect(loadFailure({ response: { status: 400 } })).toBe("gone")
    expect(loadFailure(undefined)).toBe("gone")
  })
  it("failed when Try again could fix it", () => {
    expect(loadFailure({ response: { status: 500 } })).toBe("failed")
    expect(loadFailure({ response: { status: 502 } })).toBe("failed")
    expect(loadFailure({ response: { status: 503 } })).toBe("failed")
    expect(loadFailure({ response: { status: 408 } })).toBe("failed")
    expect(loadFailure({ response: { status: 429 } })).toBe("failed")
    expect(loadFailure(new Error("Network Error"))).toBe("failed")
  })
})

describe("failureWords", () => {
  it("says a thing this person can't see is not theirs, and how to get it, naming it by its noun", () => {
    expect(failureWords("no-access", "call")).toEqual({
      title: "You can't see this call",
      detail: "It hasn't been shared with you. Ask whoever sent you the link to give you access.",
    })
  })

  it("says a thing that is gone may never have been there, with no word about trying again", () => {
    const w = failureWords("gone", "project")
    expect(w).toEqual({ title: "This project doesn't exist or was deleted", detail: "The link may be old or mistyped." })
    expect(`${w.title} ${w.detail}`).not.toMatch(/try again/i)
  })
})
