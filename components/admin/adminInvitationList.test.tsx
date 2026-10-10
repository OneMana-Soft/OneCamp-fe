import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { AdminInvitationList, expiryText } from "./AdminInvitationList"
import type { Invitation } from "@/types/user"

// An invitation says where it stands: how long a live one's link has left,
// Expired once it has run out, and a live one's link can be copied to hand
// over. An expired or used one has no link to copy.

const base = { invited_by: "", created_at: "2026-10-09T10:00:00Z" }
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

describe("the admin's invitation list", () => {
  it("says how long each live link has left", () => {
    list()
    expect(screen.getByText("Expires in 6 days")).toBeTruthy()
    expect(screen.getByText("Expires within a day")).toBeTruthy()
    expect(screen.getByText("Expired")).toBeTruthy()
  })

  // "Sent  Expires in 6 days" ran the expiry into the status word.
  it("keeps the expiry apart from the status with a separator, and has none to keep apart when there's no expiry", () => {
    list()
    const meta = (email: string) => screen.getByText(email).nextElementSibling as HTMLElement
    expect(meta(live.email).textContent).toMatch(/Sent·Expires in 6 days$/)
    expect(meta(expired.email).textContent).not.toContain("·")
  })

  it("copies a live invitation's link, and offers none for an expired or used one", () => {
    const { onCopyLink } = list()
    fireEvent.click(screen.getByRole("button", { name: "Copy the invitation link for live@example.com" }))
    expect(onCopyLink).toHaveBeenCalledWith("https://team.example/signup?token=live")
    expect(screen.queryByRole("button", { name: /Copy the invitation link for late@/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Copy the invitation link for in@/ })).toBeNull()
  })

  it("offers an expired invitation a new link, and a used one nothing to send", () => {
    const { onResend } = list()
    fireEvent.click(screen.getByRole("button", { name: "Send late@example.com a new invitation link" }))
    expect(onResend).toHaveBeenCalledWith("late@example.com")
    expect(screen.queryByRole("button", { name: /(Resend invitation to|new invitation link).*in@example.com/ })).toBeNull()
    // A joined one can only be cleared from the list: nothing about it is live.
    expect(screen.getByRole("button", { name: "Clear in@example.com's invitation from the list" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Revoke the invitation to live@example.com" })).toBeTruthy()
  })
})

describe("when an invitation was sent", () => {
  it("is the app's short date, with the full date in its tooltip, not the browser's locale", () => {
    list()
    // Day before month in any time zone the test runs in ("9 Oct", never "Oct 9").
    const sent = screen.getAllByText(/^\d{1,2} Oct( 2026)?$/)[0]
    expect(sent.tagName).toBe("TIME")
    expect(sent.getAttribute("dateTime")).toBe("2026-10-09T10:00:00Z")
    expect(sent.getAttribute("title")).toMatch(/^\w+day \d{1,2} October 2026, \d{1,2}:\d{2} (AM|PM)$/)
  })
})

describe("expiryText", () => {
  it("is empty once an invitation can't be used", () => {
    expect(expiryText({ status: "expired", expires_in_days: 3 })).toBe("")
    expect(expiryText({ status: "joined" })).toBe("")
    expect(expiryText({ status: "pending" })).toBe("")
  })
})
