import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { AdminInvitationList, expiresSoon, expiryText, invitedLine } from "./AdminInvitationList"
import type { Invitation } from "@/types/user"

// An invitation says where it stands: how long a live one's link has left
// (sun once under a day), Expired once it has run out, and a live one's link
// can be copied to hand over. An expired or used one has no link to copy.
// Design v3 (A5): an invite is not yet a person, so it is drawn as a dashed
// outline with an envelope, and every action lives in the row's ⋯ menu.

const NOW = new Date("2026-10-11T10:00:00Z").getTime()
const base = { invited_by: "arjun@kestrel.example", created_at: "2026-10-09T10:00:00Z" }
const live: Invitation = { ...base, id: "1", email: "live@example.com", status: "sent", expires_in_days: 6, invite_link: "https://team.example/signup?token=live" }
const lastDay: Invitation = { ...base, id: "2", email: "soon@example.com", status: "sent", expires_in_days: 1, invite_link: "https://team.example/signup?token=soon" }
const expired: Invitation = { ...base, id: "3", email: "late@example.com", status: "expired" }
const joined: Invitation = { ...base, id: "4", email: "in@example.com", status: "joined" }

afterEach(() => cleanup())

function list(onCopyLink = vi.fn(), onResend = vi.fn()) {
  render(
    <AdminInvitationList
      invitations={[live, lastDay, expired, joined]}
      onDelete={vi.fn()}
      onResend={onResend}
      onCopyLink={onCopyLink}
      isSubmitting={false}
      resendingEmail={null}
    />,
  )
  return { onCopyLink, onResend }
}

const openMenu = async (email: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: `Actions for the invitation to ${email}` }), { key: "Enter" })
  return screen.findAllByRole("menuitem")
}

describe("the admin's invitation list", () => {
  it("says how long each live link has left, as a dot and a word", () => {
    list()
    expect(screen.getByText("Expires in 6 d").closest("[data-dot-word]")?.getAttribute("data-dot-word")).toBe("neutral")
    // Under a day left: the word turns sun.
    expect(screen.getByText("Expires within a day").closest("[data-dot-word]")?.getAttribute("data-dot-word")).toBe("sun")
    expect(screen.getByText("Expired")).toBeTruthy()
  })

  it("draws a pending invitation as a dashed outline with an envelope, and a joined one as a face", () => {
    list()
    const mark = (email: string) => screen.getByText(email).closest("[data-person-row]")!.querySelector("[data-invite-avatar]") as HTMLElement
    expect(mark(live.email).getAttribute("data-invite-avatar")).toBe("pending")
    expect(mark(live.email).className).toContain("invite-avatar")
    expect(mark(live.email).querySelector("svg")).toBeTruthy()
    expect(mark(joined.email).getAttribute("data-invite-avatar")).toBe("joined")
    expect(mark(joined.email).className).toContain("avatar-person")
  })

  it("says who invited them and when", () => {
    expect(invitedLine(base, NOW)).toBe("Invited by Arjun · 2 d ago")
  })

  it("copies a live invitation's link, and offers none for an expired or used one", async () => {
    const { onCopyLink } = list()
    fireEvent.click((await openMenu(live.email)).find((i) => i.textContent === "Copy link")!)
    expect(onCopyLink).toHaveBeenCalledWith("https://team.example/signup?token=live")
    cleanup()
    list()
    expect((await openMenu(expired.email)).some((i) => i.textContent === "Copy link")).toBe(false)
  })

  it("offers an expired invitation a new link, and a used one only clearing from the list", async () => {
    const { onResend } = list()
    fireEvent.click((await openMenu(expired.email)).find((i) => i.textContent === "Send a new link")!)
    expect(onResend).toHaveBeenCalledWith("late@example.com")
    cleanup()
    list()
    const items = await openMenu(joined.email)
    expect(items.map((i) => i.textContent)).toEqual(["Clear from the list"])
  })

  it("puts Revoke last, in danger ink, for a live one", async () => {
    list()
    const items = await openMenu(live.email)
    expect(items.map((i) => i.textContent)).toEqual(["Resend", "Copy link", "Revoke…"])
    expect(items.at(-1)!.className).toContain("text-danger-ink")
  })
})

describe("expiryText", () => {
  it("is empty once an invitation can't be used", () => {
    expect(expiryText({ status: "expired", expires_in_days: 3 })).toBe("")
    expect(expiryText({ status: "joined" })).toBe("")
    expect(expiryText({ status: "pending" })).toBe("")
  })

  it("counts hours in the last day, from the token's own expiry", () => {
    const at = new Date(NOW + 20 * 3_600_000).toISOString()
    expect(expiryText({ status: "sent", expires_in_days: 1, token_expires_at: at }, NOW)).toBe("Expires in 20 h")
    expect(expiresSoon({ status: "sent", expires_in_days: 1, token_expires_at: at }, NOW)).toBe(true)
    expect(expiresSoon({ status: "sent", expires_in_days: 5 }, NOW)).toBe(false)
  })
})
