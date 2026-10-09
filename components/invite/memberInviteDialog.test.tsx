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
