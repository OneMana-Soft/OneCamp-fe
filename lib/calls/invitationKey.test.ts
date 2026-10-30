import { describe, expect, it } from "vitest"

import { callWithInvitation, invitationIn } from "@/lib/calls/invitationKey"

// meet-02 (1): an invitee's key travels in the fragment from their invitation's
// "Join call" to the event's call, and comes back out as it went in.
describe("an invitee's key on the way to the call", () => {
  it("rides in the fragment, encoded, and reads back as it went", () => {
    const href = callWithInvitation("/r/design-review-1a2b", "a/b+c=d")
    expect(href).toBe("/r/design-review-1a2b#invitation=a%2Fb%2Bc%3Dd")
    expect(invitationIn(href.slice(href.indexOf("#")))).toBe("a/b+c=d")
  })
  it("is nothing when there is none", () => {
    expect(callWithInvitation("/r/design-review-1a2b", "")).toBe("/r/design-review-1a2b")
    for (const hash of ["", "#", "#invitation=", "#invitation=%20", "#other=1"]) expect(invitationIn(hash)).toBeUndefined()
  })
})
