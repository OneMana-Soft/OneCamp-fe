import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The first run's invite step tells the truth when email is off (SHELL-02):
// a fresh install can't send email until an admin adds a key, so the step
// promises links, not emails, before anything is sent; when an email couldn't
// go it stays on the step with each person's link; and it opens OneCamp at
// once only when every email went.

const invite = vi.hoisted(() => vi.fn())
vi.mock("@/services/invitationService", () => ({ invite }))
const server = vi.hoisted(() => ({ email: null as boolean | null }))
vi.mock("@/lib/auth/useSignInFacts", () => ({ useEmailConfigured: () => server.email }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async () => true) }) }))

import { TeamStep } from "@/components/auth/FirstRun"

const LINK = (who: string) => `https://camp.example.com/signup?token=${who}`
const made = (who: string) => ({ ok: true, answer: { email_sent: false, email_error: "email isn't set up on this server", invite_link: LINK(who) } })
const sent = (who: string) => ({ ok: true, answer: { email_sent: true, invite_link: LINK(who) } })

beforeEach(() => {
  invite.mockReset()
  server.email = null
})
afterEach(cleanup)

function step() {
  const onFinish = vi.fn()
  render(<TeamStep onPeople={vi.fn()} onFinish={onFinish} />)
  fireEvent.paste(screen.getByLabelText("Email addresses"), { clipboardData: { getData: () => "ana@x.io, ben@x.io" } })
  return onFinish
}

describe("the first run's invitations", () => {
  it("stays on the step and offers each link when email couldn't go", async () => {
    server.email = false
    invite.mockImplementation(async (email: string) => made(email))
    const onFinish = step()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Create 2 invitations" })))
    expect(invite).toHaveBeenCalledTimes(2)
    expect(onFinish).not.toHaveBeenCalled()
    expect(screen.getAllByText("Email isn't set up yet. Share these links, or set up email in Admin › Email.")).toHaveLength(1)
    // Said once, over the rows: each row is ready, not a failure.
    expect(screen.queryByText(/Couldn't email/)).toBeNull()
    expect(Array.from(document.querySelectorAll("[data-invite-result]")).map((r) => r.getAttribute("data-invite-result"))).toEqual(["created", "created"])
    expect(screen.getByRole("button", { name: "Copy the link for ana@x.io" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy the link for ben@x.io" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy all links" })).toBeTruthy()
    // No second way out that leaves the links behind unseen: one primary,
    // which has the cursor, since the button pressed is gone.
    expect(screen.queryByRole("button", { name: "I'll do this later" })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open OneCamp" }))
    fireEvent.click(screen.getByRole("button", { name: "Open OneCamp" }))
    expect(onFinish).toHaveBeenCalled()
  })

  it("says links, not emails, when the server can't send", () => {
    server.email = false
    step()
    const lead = document.querySelector("[data-first-run-lead]")?.textContent ?? ""
    expect(lead).toContain("This server can't send email yet, so you'll get a link to share with each person yourself.")
    expect(lead).not.toMatch(/gets an email/)
    expect(screen.getByRole("button", { name: "Create 2 invitations" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Send/ })).toBeNull()
  })

  it("opens OneCamp at once when every email went", async () => {
    server.email = true
    invite.mockImplementation(async (email: string) => sent(email))
    const onFinish = step()
    expect(document.querySelector("[data-first-run-lead]")?.textContent).toContain("Each gets an email with a link to join, good for seven days.")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send 2 invitations and open OneCamp" })))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it("keeps the refused beside the made, each saying why, when the server took some and refused others", async () => {
    server.email = true
    invite.mockResolvedValueOnce(sent("ana@x.io")).mockResolvedValueOnce({ ok: false, msg: "ben@x.io is already a member of this workspace." })
    const onFinish = step()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send 2 invitations and open OneCamp" })))
    expect(onFinish).not.toHaveBeenCalled()
    expect(Array.from(document.querySelectorAll("[data-invite-result]")).map((r) => r.getAttribute("data-invite-result"))).toEqual(["sent", "refused"])
    expect(screen.getByText("ben@x.io is already a member of this workspace.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Copy all links" })).toBeNull()
  })
})
