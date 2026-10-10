import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// A member inviting someone already here is told why, in the dialog.

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const invite = vi.fn()
vi.mock("@/services/invitationService", () => ({ invite }))

const { MemberInviteDialog } = await import("./MemberInviteDialog")

afterEach(() => {
  cleanup()
  invite.mockReset()
  toast.mockReset()
})

describe("a member inviting someone", () => {
  it("says why the server refused, and stays open", async () => {
    invite.mockResolvedValue({ ok: false, msg: "ana@example.com is already a member of this workspace." })
    const onOpenChange = vi.fn()
    render(<MemberInviteDialog open onOpenChange={onOpenChange} />)
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ana@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: /send invitation/i }).closest("form")!)
    expect((await screen.findByRole("alert")).textContent).toBe("ana@example.com is already a member of this workspace.")
    expect(invite).toHaveBeenCalledWith("ana@example.com", false)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(toast).not.toHaveBeenCalled()
  })
})

describe("the member invite dialog's form and its end", () => {
  it("asks for someone else's address without offering the inviter's own", () => {
    render(<MemberInviteDialog open onOpenChange={vi.fn()} />)
    const box = screen.getByLabelText(/email address/i)
    expect(box).toHaveAttribute("name", "email")
    expect(box).toHaveAttribute("autocomplete", "off")
    expect(box).toHaveAttribute("spellcheck", "false")
  })

  it("puts its title icon on a people tile, not in the accent", () => {
    render(<MemberInviteDialog open onOpenChange={vi.fn()} />)
    const title = screen.getByRole("heading", { name: "Invite people" })
    const tile = title.querySelector("span.hue-sky")
    expect(tile).not.toBeNull()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  it("offers another invitation once one is made, from an empty form", async () => {
    invite.mockResolvedValue({ ok: true, answer: { email_sent: true, email_error: "", invite_link: "https://team.example.com/signup?token=abc" } })
    const onOpenChange = vi.fn()
    render(<MemberInviteDialog open onOpenChange={onOpenChange} />)
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ana@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: /send invitation/i }).closest("form")!)
    fireEvent.click(await screen.findByRole("button", { name: "Invite another" }))
    expect(screen.getByLabelText(/email address/i)).toHaveValue("")
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
