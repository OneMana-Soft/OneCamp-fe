import { describe, expect, it } from "vitest"
import { initialSelection, inviteSummary, isPlaceholderEmail, notListedLine, roomForAnother, seatLine } from "./importInvites"
import type { InvitablePerson, InviteRun } from "@/services/importService"

const person = (n: number): InvitablePerson => ({ user_id: `u${n}`, name: `P${n}`, email: `p${n}@acme.test` })

describe("inviting the people an import brought across", () => {
  // Mirrors the server's IsPlaceholderEmail: an invitation to a made-up
  // address could never be accepted.
  it("knows a made-up address from a real one", () => {
    expect(isPlaceholderEmail("priya@acme.com")).toBe(false)
    expect(isPlaceholderEmail("Priya@Acme.com ")).toBe(false)
    expect(isPlaceholderEmail("priya+design@acme.com")).toBe(false)
    for (const made of [
      "asana-import-acme-1@no-reply.local",
      "github+octocat@external.onecamp.local",
      "priya+x-123@acme.com",
      "priya+slack-u1@acme.com",
      "",
      undefined,
      "no-at-sign",
      "@acme.com",
      "priya@",
    ]) {
      expect(isPlaceholderEmail(made)).toBe(true)
    }
  })

  it("ticks everyone when there is no limit, and only as many as there is room for", () => {
    const people = [person(1), person(2), person(3)]
    expect([...initialSelection(people, { used: 4, limit: 0, left: null })]).toEqual(["u1", "u2", "u3"])
    expect([...initialSelection(people, { used: 23, limit: 25, left: 2 })]).toEqual(["u1", "u2"])
    expect([...initialSelection(people, { used: 25, limit: 25, left: 0 })]).toEqual([])
    expect(roomForAnother(2, { used: 23, limit: 25, left: 2 })).toBe(false)
    expect(roomForAnother(1, { used: 23, limit: 25, left: 2 })).toBe(true)
    expect(roomForAnother(400, { used: 0, limit: 0, left: null })).toBe(true)
  })

  it("says the plan's room plainly, and nothing without a limit", () => {
    expect(seatLine({ used: 4, limit: 0, left: null })).toBeNull()
    expect(seatLine({ used: 23, limit: 25, left: 2 })).toBe("Your free plan has room for 2 more people (23 of 25 places taken).")
    expect(seatLine({ used: 24, limit: 25, left: 1 })).toBe("Your free plan has room for 1 more person (24 of 25 places taken).")
    expect(seatLine({ used: 25, limit: 25, left: 0 })).toMatch(/^Your free plan is full: all 25 places are taken/)
  })

  it("says why the rest aren't listed, leaving out what is zero", () => {
    expect(notListedLine({ already_members: 3, already_invited: 0, no_email: 2, left: 1 })).toBe(
      "Not listed: 3 already here, 2 without an email address, 1 who had left.",
    )
    expect(notListedLine({ already_members: 0, already_invited: 0, no_email: 0, left: 0 })).toBe("")
  })

  it("sums up a run, including a full plan and a refusal", () => {
    const run: InviteRun = {
      invited: [person(1), person(2)],
      alreadyInvited: [person(3)],
      failed: [{ person: person(4), msg: "failed to add invitation" }],
      seatLimit: { msg: "The plan is full.", notInvited: [person(5), person(6)] },
      emailSent: false,
    }
    expect(inviteSummary(run)).toEqual([
      "Invited 2 people. Email isn't set up on this server, so nothing was sent: copy their links from Admin, Invitations.",
      "1 person was already invited.",
      "The plan is full. 2 people weren't invited.",
      "Couldn't invite P4 (p4@acme.test): failed to add invitation",
    ])
    expect(inviteSummary({ ...run, alreadyInvited: [], failed: [], seatLimit: null, emailSent: true })).toEqual([
      "Invited 2 people. Each gets an email with a link to join.",
    ])
  })
})
