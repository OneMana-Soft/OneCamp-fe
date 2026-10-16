import { describe, expect, it } from "vitest"

import { loadFailure } from "./loadFailure"

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
