import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The Invitations tab: its button keeps its words on a phone, a list that
// failed to load says so, a resend that can't reach the server says why, and
// clearing an invitation asks in words that fit what it does: a live one is
// revoked, a joined or expired one only leaves the list.

const live = { id: "i1", email: "elif@kestrel.studio", invited_by: "priya@kestrel.studio", status: "sent", expires_in_days: 6, invite_link: "https://x/signup?token=a", created_at: "2026-10-09T10:14:00Z" }
const joined = { id: "i2", email: "kwame@kestrel.studio", invited_by: "arjun@kestrel.studio", status: "joined", created_at: "2026-09-29T11:20:00Z" }

const state = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() },
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => state.list }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn(async () => true) }) }))
const resend = vi.hoisted(() => vi.fn())
vi.mock("@/services/invitationService", () => ({ resendInvitation: resend }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { default: InvitationCard } = await import("./invitationCard")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.list = { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
})

describe("the Invitations tab", () => {
  it("keeps the invite button's words on a phone", () => {
    state.list = { data: { data: [live] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<InvitationCard />)
    const button = screen.getByRole("button", { name: "Invite people" })
    expect(button.querySelector(".hidden")).toBeNull()
  })

  it("says the list failed to load instead of claiming there are none", () => {
    const mutate = vi.fn()
    state.list = { data: undefined, isLoading: false, isError: new Error("503"), mutate }
    render(<InvitationCard />)
    expect(screen.queryByText(/No pending invitations/)).toBeNull()
    expect(screen.getByText("Couldn't load the invitations")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("loads as the rows it will show, in one bordered list", () => {
    state.list = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    const { container } = render(<InvitationCard />)
    const list = container.querySelector("ul[aria-busy='true']")
    expect(list?.className).toMatch(/divide-y/)
    expect(list?.className).not.toMatch(/space-y/)
  })

  it("says why a resend failed when the server can't be reached", async () => {
    state.list = { data: { data: [live] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    resend.mockRejectedValue(new Error("Network Error"))
    render(<InvitationCard />)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Resend invitation to elif@kestrel.studio" })))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't send it again",
      description: expect.stringMatching(/server could not be reached/),
      variant: "destructive",
    }))
  })

  it("revokes a live invitation, and only clears a joined one from the list", () => {
    state.list = { data: { data: [live, joined] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<InvitationCard />)
    fireEvent.click(screen.getByRole("button", { name: "Revoke the invitation to elif@kestrel.studio" }))
    expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({
      title: "Revoke the invitation to elif@kestrel.studio?",
      confirmText: "Revoke invitation",
    }))
    fireEvent.click(screen.getByRole("button", { name: "Clear kwame@kestrel.studio's invitation from the list" }))
    const last = confirm.mock.calls.at(-1)?.[0]
    expect(last.title).toBe("Clear kwame@kestrel.studio's invitation from the list?")
    expect(last.description).not.toMatch(/stops working/)
  })
})
