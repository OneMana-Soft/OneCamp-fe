import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The rows of an invitation round, shared by the invite dialogs and the first
// run (SHELL-02): one per address, and, when two or more emails couldn't go,
// every link at once, so an admin with no email set up pastes one message
// rather than copying links one by one.

const copy = vi.hoisted(() => vi.fn(async () => true))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copied: false, copy }) }))

import { InviteResults, type InviteResult } from "@/components/invite/inviteRound"

afterEach(() => {
  cleanup()
  copy.mockClear()
})

const made = (email: string): InviteResult => ({ email, state: "created", answer: { email_sent: false, invite_link: `https://camp.example.com/${email}` } })

describe("an invitation round's rows", () => {
  it("copies every link at once", () => {
    render(
      <InviteResults
        results={[
          made("ana@x.io"),
          { email: "cy@x.io", state: "sent", answer: { email_sent: true, invite_link: "https://camp.example.com/cy@x.io" } },
          made("ben@x.io"),
          { email: "di@x.io", state: "refused", msg: "di@x.io is already a member of this workspace." },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Copy all links" }))
    expect(copy).toHaveBeenCalledWith("ana@x.io — https://camp.example.com/ana@x.io\nben@x.io — https://camp.example.com/ben@x.io", "2 invitation links copied")
  })

  it("says why each email didn't go, whole, on a line of its own under the address", () => {
    render(<InviteResults results={[{ email: "priya.sharma@kestrel.studio", state: "created", answer: { email_sent: false, email_error: "email isn't set up on this server", invite_link: "https://camp.example.com/p" } }]} />)
    const why = screen.getByText("Couldn't email it: email isn't set up on this server")
    expect(why.className).toMatch(/\bbasis-full\b/)
    expect(why.className).not.toMatch(/\btruncate\b/)
    expect(why.getAttribute("title")).toBeNull()
  })

  it("with email off, a created row is ready: no warning mark and no reason of its own", () => {
    render(<InviteResults emailOn={false} results={[made("ana@x.io"), made("ben@x.io"), { email: "di@x.io", state: "refused", msg: "di@x.io is already a member of this workspace." }]} />)
    expect(screen.queryByText(/Couldn't email/)).toBeNull()
    const ready = Array.from(document.querySelectorAll("[data-invite-result='created']"))
    expect(ready).toHaveLength(2)
    for (const row of ready) {
      expect(row.querySelector("[data-invite-mark]")?.getAttribute("data-invite-mark")).toBe("ready")
      expect(row.innerHTML).not.toMatch(/camp-sun|warning/)
    }
    // A refusal is still an error, said whole.
    expect(screen.getByText("di@x.io is already a member of this workspace.").className).toMatch(/\btext-danger-ink\b/)
  })

  it("offers no Copy all links for a single link, nor while the round is still going", () => {
    render(<InviteResults results={[made("ana@x.io"), { email: "cy@x.io", state: "sent", answer: { email_sent: true } }]} />)
    expect(screen.queryByRole("button", { name: "Copy all links" })).toBeNull()
    cleanup()
    render(<InviteResults results={[made("ana@x.io"), made("ben@x.io"), { email: "cy@x.io", state: "waiting" }]} />)
    expect(screen.queryByRole("button", { name: "Copy all links" })).toBeNull()
  })
})
