import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import React, { useState } from "react"

// Inside a larger overlay (the guided first run) the invite form's actions go
// in that overlay's footer, which stays in view, and still send the form.

const invite = vi.fn()
vi.mock("@/services/invitationService", () => ({ invite }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async () => true) }) }))

const { InviteForm } = await import("./InviteForm")

afterEach(() => {
  cleanup()
  invite.mockReset()
})

function InAnOverlay({ onClose }: { onClose: () => void }) {
  const [footer, setFooter] = useState<HTMLElement | null>(null)
  return (
    <div>
      <div data-testid="body">
        <InviteForm asAdmin noCancel footerTo={footer} doneLabel="Next" onClose={onClose} header={() => null} />
      </div>
      <div data-testid="footer" ref={setFooter} />
    </div>
  )
}

describe("the invite form inside another overlay", () => {
  it("puts Send in that overlay's footer, where it still sends the form, and Next after", async () => {
    invite.mockResolvedValue({ ok: true, answer: { email_sent: true, invite_link: "https://team.example.test/join/abc" } })
    const onClose = vi.fn()
    render(<InAnOverlay onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ana@example.com" } })
    const send = screen.getByRole("button", { name: /send invitation/i })
    expect(screen.getByTestId("footer").contains(send)).toBe(true)
    expect(screen.getByTestId("body").contains(send)).toBe(false)
    // Still a DialogFooter, without a box of its own: its buttons join that footer's row.
    expect(send.closest("[data-dialog-footer]")?.classList.contains("contents")).toBe(true)
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
    await act(async () => fireEvent.click(send))
    expect(invite).toHaveBeenCalledWith("ana@example.com", true)
    const next = await screen.findByRole("button", { name: "Next" })
    expect(screen.getByTestId("footer").contains(next)).toBe(true)
    fireEvent.click(next)
    expect(onClose).toHaveBeenCalled()
  })
})
