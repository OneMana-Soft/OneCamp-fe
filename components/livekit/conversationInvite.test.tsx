// A conversation's call's Invite (calls HU13): a link made on asking, that
// opens this call alone while it lasts, copied in one press; a refusal is
// said in the server's words.
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const inviteToCall = vi.fn()
vi.mock("@/services/callInviteService", () => ({ inviteToCall: (...a: unknown[]) => inviteToCall(...a) }))
// The phone rule (components/ui/overlayMode), set per test.
let phone = false
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => phone, SHEET_QUERY: "(max-width: 0px)" }))

import { ConversationInvite } from "./ConversationInvite"
import { pinTestClock } from "@/lib/testing/testClock"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  phone = false
})

describe("a conversation's call's Invite", () => {
  // Its links say when they end.
  pinTestClock()
  it("makes a link that opens this call alone, and copies it", async () => {
    inviteToCall.mockResolvedValueOnce({ guest_token: "raw", grant_id: "g1", expires_at: "2026-10-21T20:00:00Z" })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<ConversationInvite callRef={{ kind: "channel", id: "c1" }} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Invite people" })))
    expect(screen.getByText("Invite to this call")).toBeInTheDocument()
    expect(screen.getByText(/never see this conversation/)).toBeInTheDocument()
    expect(inviteToCall).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make an invite link" })))
    expect(inviteToCall).toHaveBeenCalledWith({ kind: "channel", id: "c1" })
    const url = `${window.location.origin}/guest/m/raw`
    // Read, never typed in: the whole address in the page, cut in the middle
    // so its own end (the token) stays in sight (DESIGN-BUILD-4, 22 Oct).
    const link = screen.getByLabelText("Invite link")
    expect(link.tagName).not.toBe("INPUT")
    expect(link.textContent).toBe(url)
    const cut = link.querySelector("[data-middle-name]")
    expect(cut?.lastElementChild?.textContent).toBe(url.slice(-6))
    expect(cut?.firstElementChild?.className).toContain("truncate")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/guest/m/raw`)
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  // On a phone every overlay is a sheet, its action pinned at the foot (the phone rule).
  it("is a sheet on a phone, with its action pinned at the foot", async () => {
    phone = true
    inviteToCall.mockResolvedValueOnce({ guest_token: "raw", grant_id: "g1", expires_at: "2026-10-21T20:00:00Z" })
    render(<ConversationInvite callRef={{ kind: "channel", id: "c1" }} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Invite people" })))
    const sheet = await screen.findByRole("dialog")
    expect(sheet.textContent).toContain("Invite to this call")
    // On the call's dark surface in either theme, as the popover is.
    expect(sheet.closest("[data-v3-sheet]")?.classList.contains("dark")).toBe(true)
    expect(document.querySelector("[data-invite-details]")).toBeNull()
    const make = screen.getByRole("button", { name: "Make an invite link" })
    expect(make.closest("[data-sheet-footer]")).not.toBeNull()
    await act(async () => fireEvent.click(make))
    expect(screen.getByLabelText("Invite link").textContent).toBe(`${window.location.origin}/guest/m/raw`)
  })

  it("says why a link couldn't be made, in the server's words", async () => {
    inviteToCall.mockRejectedValueOnce({ response: { status: 403, data: { code: "guests_off", msg: "Guest access is off for this workspace." } } })
    render(<ConversationInvite callRef={{ kind: "dm", id: "a b" }} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Invite people" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make an invite link" })))
    expect((await screen.findByRole("alert")).textContent).toBe("Guest access is off for this workspace.")
    expect(screen.queryByLabelText("Invite link")).toBeNull()
  })
})
