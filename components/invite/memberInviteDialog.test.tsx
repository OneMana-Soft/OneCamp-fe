import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// A member inviting someone already here is told why, in the dialog.

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
const invite = vi.fn()
vi.mock("@/services/invitationService", () => ({ invite }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async () => true) }) }))

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
    const tile = title.querySelector("span.hue-ink")
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

// Design v3 (E6): addresses become chips as they are typed or pasted, Send
// counts them, and several are sent in turn with a row each, so a refusal for
// one never hides that the others went.
describe("the invite dialog's chips", () => {
  it("splits a paste on commas, spaces, semicolons and newlines, once each, and marks the bad ones", async () => {
    const { parseAddresses } = await import("./InviteForm")
    const chips = parseAddresses("ana@example.com, Bo@Example.com\nnot-an-email;cy@example.com  ana@example.com", new Set(["cy@example.com"]))
    expect(chips.map((c) => [c.email, c.kind])).toEqual([
      ["ana@example.com", "ok"],
      ["bo@example.com", "ok"],
      ["not-an-email", "invalid"],
      ["cy@example.com", "known"],
    ])
    expect(chips[2].reason).toBe("That isn't an email address.")
  })

  it("turns a paste into chips and counts only the good ones on Send", () => {
    render(<MemberInviteDialog open onOpenChange={vi.fn()} />)
    const box = screen.getByLabelText(/email address/i)
    fireEvent.paste(box, { clipboardData: { getData: () => "ana@example.com, bo@example.com\nnope" } })
    expect(document.querySelectorAll("[data-invite-chip='ok']").length).toBe(2)
    expect(document.querySelector("[data-invite-chip='invalid']")?.textContent).toContain("nope")
    expect(screen.getByRole("button", { name: "Send 2 invitations" })).toBeTruthy()
    // Said under the field, not only in a tooltip a phone can't hover (critic,
    // 11 Oct), and tied to the field for a screen reader.
    const line = document.querySelector("[data-invalid-line]") as HTMLElement
    expect(line.textContent).toBe("“nope” isn't an email address, so it won't be sent. Fix it or remove it.")
    expect(line.className).toContain("text-danger-ink")
    expect(box.getAttribute("aria-describedby")).toContain(line.id)
  })

  it("tints a bad address's chip by the attribute the chip carries", () => {
    // The rules named data-kind, which nothing set, so a bad chip looked good.
    const css = readFileSync("app/styles/admin/people.css", "utf8")
    expect(css).toMatch(/\.invite-chip\[data-invite-chip="invalid"\]\s*\{[^}]*--destructive/)
    expect(css).not.toMatch(/\.invite-chip\[data-kind=/)
  })

  it("selects the last chip on the first Backspace and removes it on the second", () => {
    render(<MemberInviteDialog open onOpenChange={vi.fn()} />)
    const box = screen.getByLabelText(/email address/i)
    fireEvent.paste(box, { clipboardData: { getData: () => "ana@example.com bo@example.com" } })
    fireEvent.keyDown(box, { key: "Backspace" })
    expect(document.querySelector("[data-selected='true']")?.textContent).toContain("bo@example.com")
    fireEvent.keyDown(box, { key: "Backspace" })
    expect(document.querySelectorAll("[data-invite-chip]").length).toBe(1)
  })

  it("sends several in turn and gives each its own outcome", async () => {
    invite
      .mockResolvedValueOnce({ ok: true, answer: { email_sent: true, invite_link: "https://x/a" } })
      .mockResolvedValueOnce({ ok: true, answer: { email_sent: false, email_error: "the day's limit was reached", invite_link: "https://x/b" } })
      .mockResolvedValueOnce({ ok: false, msg: "cy@example.com is already a member of this workspace." })
    render(<MemberInviteDialog open onOpenChange={vi.fn()} />)
    fireEvent.paste(screen.getByLabelText(/email address/i), { clipboardData: { getData: () => "ana@example.com, bo@example.com, cy@example.com" } })
    fireEvent.submit(screen.getByRole("button", { name: "Send 3 invitations" }).closest("form")!)
    expect(await screen.findByText("1 sent · 1 to share by link · 1 refused")).toBeTruthy()
    const rows = Array.from(document.querySelectorAll("[data-invite-result]"))
    expect(rows.map((r) => r.getAttribute("data-invite-result"))).toEqual(["sent", "created", "refused"])
    expect(invite.mock.calls.map((c) => c[0])).toEqual(["ana@example.com", "bo@example.com", "cy@example.com"])
    expect(screen.getByRole("button", { name: "Copy the link for bo@example.com" })).toBeTruthy()
  })
})

describe("the seat line", () => {
  it("says how many places are left and how many won't fit, only when they don't", async () => {
    const { seatLine } = await import("./InviteForm")
    expect(seatLine(2, 5)).toBe("")
    expect(seatLine(5, 3)).toBe("3 places left on the free plan. 2 of these won't fit.")
    expect(seatLine(1, 0)).toBe("No places left on the free plan. 1 of these won't fit.")
    expect(seatLine(9, undefined)).toBe("")
  })
})
