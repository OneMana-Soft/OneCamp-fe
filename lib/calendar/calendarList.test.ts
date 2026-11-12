import { describe, expect, it } from "vitest"

import { mayAddEventTo, readOnlyIn, readOnlyRefusal } from "./calendarList"

// V-594: a calendar moved from Google or Outlook that is read-only there says
// so, takes no new event, and a refused one is said in the server's words.
// A server that sends neither source nor read_only is read as today.
describe("a calendar read-only in its provider", () => {
  it("takes no new event; one the reader may add to does, as before", () => {
    expect(mayAddEventTo({ access: "manage" })).toBe(true)
    expect(mayAddEventTo({ access: "edit", read_only: false })).toBe(true)
    expect(mayAddEventTo({ access: "view" })).toBe(false)
    expect(mayAddEventTo({ access: "manage", read_only: true })).toBe(false)
  })

  it("says where it is read-only, for Google's and Outlook's only", () => {
    expect(readOnlyIn({ source: "google", read_only: true })).toBe("Read-only in Google")
    expect(readOnlyIn({ source: "microsoft", read_only: true })).toBe("Read-only in Outlook")
    expect(readOnlyIn({ source: "google" })).toBe("")
    // One read from an address says so on its own menu (B8); OneCamp's own and an old server's say nothing.
    expect(readOnlyIn({ source: "ics", read_only: true })).toBe("")
    expect(readOnlyIn({ source: "onecamp" })).toBe("")
    expect(readOnlyIn({})).toBe("")
  })

  it("reads the server's words from a 409 calendar_read_only, and nothing from any other refusal", () => {
    const msg = "This calendar is read-only in Google. Put the event on another calendar."
    expect(readOnlyRefusal({ response: { status: 409, data: { code: "calendar_read_only", msg } } })).toBe(msg)
    expect(readOnlyRefusal({ response: { status: 409, data: { msg: "Someone changed it" } } })).toBe("")
    expect(readOnlyRefusal({ response: { status: 403, data: { code: "calendar_read_only", msg } } })).toBe("")
    expect(readOnlyRefusal(new Error("Network Error"))).toBe("")
    expect(readOnlyRefusal(undefined)).toBe("")
  })
})
