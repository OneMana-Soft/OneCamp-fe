import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// "Invitation sent" used to mean only that a sending key was set. Both invite
// dialogs now say what the email provider answered: sent, or why not, with the
// link to copy either way.

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const invite = vi.fn()
vi.mock("@/services/invitationService", () => ({ invite }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ email_enabled: true }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: [] }, mutate: async () => undefined }) }))

const { MemberInviteDialog } = await import("./MemberInviteDialog")
const { AddInvitationDialog } = await import("@/components/admin/AddInvitationDialog")
const { describeInvitation } = await import("./InvitationOutcome")

const LINK = "https://team.example.com/signup?token=abc"

afterEach(() => {
  cleanup()
  invite.mockReset()
  toast.mockReset()
})

describe("what an invitation says about its email", () => {
  it("says the provider's reason in words that read on", () => {
    expect(describeInvitation({ email_sent: true, invite_link: LINK }, "ana@example.com")).toMatchObject({ sent: true, title: "Email sent" })
    expect(describeInvitation({ email_sent: false, email_error: "email isn't set up on this server", invite_link: LINK }, "ana@example.com").message)
      .toBe("Couldn't email it: email isn't set up on this server. Copy the link instead.")
    expect(describeInvitation({ email_sent: false, invite_link: LINK }, "ana@example.com").message).toBe("Couldn't email it. Copy the link instead.")
  })
})

const dialogs = [
  ["a member's dialog", () => render(<MemberInviteDialog open onOpenChange={vi.fn()} />)],
  ["the admin's dialog", () => render(<AddInvitationDialog open onOpenChange={vi.fn()} onSuccess={() => {}} />)],
] as const

describe.each(dialogs)("%s", (_, open) => {
  async function inviteAna() {
    open()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ana@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: /send invitation/i }).closest("form")!)
    return screen.findByRole("textbox", { name: "Invitation link" })
  }

  it("says the email was sent, and still offers the link", async () => {
    invite.mockResolvedValue({ ok: true, answer: { email_sent: true, email_error: "", invite_link: LINK } })
    expect(((await inviteAna()) as HTMLInputElement).value).toBe(LINK)
    expect(screen.getByRole("heading", { name: "Email sent" })).toBeTruthy()
    expect(screen.getByRole("status").textContent).toMatch(/^Email sent to ana@example.com\./)
    expect(screen.getByRole("button", { name: "Copy invitation link" })).toBeTruthy()
    expect(toast).not.toHaveBeenCalled()
  })

  it("says why the email couldn't go, and hands over the link instead", async () => {
    invite.mockResolvedValue({
      ok: true,
      answer: { email_sent: false, email_error: "the email provider refused it (The acme.example domain is not verified)", invite_link: LINK },
    })
    expect(((await inviteAna()) as HTMLInputElement).value).toBe(LINK)
    expect(screen.getByRole("alert").textContent).toBe(
      "Couldn't email it: the email provider refused it (The acme.example domain is not verified). Copy the link instead.",
    )
    expect(screen.queryByRole("heading", { name: "Email sent" })).toBeNull()
  })
})
