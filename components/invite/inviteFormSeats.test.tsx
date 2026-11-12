import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The free plan's limit, met in the invite form (ADMIN-02): one note, said
// as the chips are added, with the way past it for an admin and "ask an
// admin" for a member. It was a line with no link, and a member met a bare
// refusal.

const invite = vi.fn()
vi.mock("@/services/invitationService", () => ({ invite }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async () => true) }) }))

const { InviteForm } = await import("./InviteForm")

afterEach(() => {
  cleanup()
  invite.mockReset()
})

const LINKS = {
  licence: "https://shop.example/buy?plan=lifetime",
  cloud: "https://shop.example/buy?plan=cloud",
  account: "https://shop.example/account",
  pricing: "https://shop.example/pricing",
}

describe("the invite form at the free plan's limit", () => {
  it("adding the chip that overflows says so, live, with the way past it", async () => {
    render(<InviteForm asAdmin seats={{ used: 19, limit: 25, links: LINKS }} onClose={vi.fn()} header={() => null} />)
    const box = screen.getByLabelText(/email address/i)
    expect(screen.queryByRole("status")).toBeNull()
    fireEvent.paste(box, { clipboardData: { getData: () => "a@example.com, b@example.com, c@example.com, d@example.com" } })
    // They fit, and the plan is under 80%: nothing to say yet.
    expect(screen.queryByRole("status")).toBeNull()
    fireEvent.paste(box, { clipboardData: { getData: () => "e@example.com f@example.com g@example.com" } })
    // The note's code comes when it is first drawn (components/admin/plan/LimitNote).
    const line = await screen.findByRole("status")
    expect(line).toHaveTextContent("6 places left on the free plan. 1 of these won't fit.")
    expect(line).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("link", { name: "Remove the 25-person limit" })).toHaveAttribute("href", LINKS.licence)
    expect(box.getAttribute("aria-describedby")).toContain(line.closest("[data-seat-limit-note]")!.id)
  })

  it("a member who meets the limit is told to ask an admin, never shown a purchase", async () => {
    invite.mockResolvedValue({ ok: false, code: "seat_limit", limit: 25, msg: "This workspace is on OneCamp's free plan, which has room for 25 people, and it is full." })
    render(<InviteForm asAdmin={false} onClose={vi.fn()} header={() => null} />)
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "ana@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: /send invitation/i }).closest("form")!)
    expect(await screen.findByText("Ask an admin to remove the 25-person limit.")).toBeTruthy()
    expect(screen.getByRole("status")).toHaveTextContent("This workspace's free plan is full.")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  // DB-134 F2: the one orange action was the one that had just failed, and a
  // second press met the same refusal. It steps back until the addresses
  // change, and Close is the way out.
  it("after a seat refusal, Send steps back until the addresses change, and Close is the way out", async () => {
    invite.mockResolvedValue({ ok: false, code: "seat_limit", limit: 25, msg: "full" })
    const onClose = vi.fn()
    render(<InviteForm asAdmin={false} onClose={onClose} header={() => null} />)
    const field = screen.getByLabelText(/email address/i)
    fireEvent.change(field, { target: { value: "ana@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: /send invitation/i }).closest("form")!)
    await screen.findByText("Ask an admin to remove the 25-person limit.")
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.change(field, { target: { value: "ben@example.com" } })
    expect(screen.getByRole("button", { name: /send 2 invitations/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
  })

  it("several refused at the limit say so once, under the rows", async () => {
    invite
      .mockResolvedValueOnce({ ok: true, answer: { email_sent: true, invite_link: "https://x/a" } })
      .mockResolvedValue({ ok: false, code: "seat_limit", limit: 25, msg: "full" })
    render(<InviteForm asAdmin={false} onClose={vi.fn()} header={() => null} />)
    fireEvent.paste(screen.getByLabelText(/email address/i), { clipboardData: { getData: () => "a@example.com, b@example.com, c@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: "Send 3 invitations" }).closest("form")!)
    expect(await screen.findByText("Ask an admin to remove the 25-person limit.")).toBeTruthy()
    expect(screen.getAllByText("No place left on the free plan.")).toHaveLength(2)
  })
})
