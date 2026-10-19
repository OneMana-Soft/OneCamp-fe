import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { warmBursts } from "@/lib/celebrateSoon"

// The celebrations' bursts are a chunk fetched when the page is idle
// (lib/celebrateSoon): here they are in before anything finishes.
beforeAll(async () => {
  await warmBursts()
})

// The Invitations tab: its button keeps its words on a phone, a list that
// failed to load says so, a resend that can't reach the server says why, and
// clearing an invitation asks in words that fit what it does: a live one is
// revoked, a joined or expired one only leaves the list.
//
// Design v3 (A5): an invite is drawn as a dashed outline (not yet a person);
// accepted while the page is open, the row turns into their face and says
// "Joined just now"; and the workspace's FIRST acceptance ever fires the
// celebration, one of the area's four moments, never again after that.

const live = { id: "i1", email: "elif@kestrel.example", invited_by: "priya@kestrel.example", status: "sent", expires_in_days: 6, invite_link: "https://x/signup?token=a", created_at: "2026-10-09T10:14:00Z" }
const joined = { id: "i2", email: "kwame@kestrel.example", invited_by: "arjun@kestrel.example", status: "joined", created_at: "2026-09-29T11:20:00Z" }

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
const celebrate = vi.hoisted(() => vi.fn((...args: unknown[]) => args.length + 7))
vi.mock("@/lib/celebrate", () => ({ celebrate }))

const { default: InvitationCard, newlyAccepted, FIRST_ACCEPT_KEY } = await import("./invitationCard")

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.list = { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
})

const openMenu = async (email: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: `Actions for the invitation to ${email}` }), { key: "Enter" })
  return screen.findAllByRole("menuitem")
}
const show = (label: "Pending" | "Accepted" | "Expired") => fireEvent.click(screen.getByRole("radio", { name: label }))

describe("the Invitations tab", () => {
  it("keeps the invite button's words on a phone", () => {
    state.list = { data: { data: [live] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<InvitationCard />)
    const button = screen.getAllByRole("button", { name: /^Invite people/ })[0]
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

  it("loads as the rows it will show, in the list's own rows", () => {
    state.list = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    const { container } = render(<InvitationCard />)
    expect(container.querySelector("ul[aria-busy='true']")?.className).toContain("people-rows")
  })

  it("says why a resend failed when the server can't be reached", async () => {
    state.list = { data: { data: [live] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    resend.mockRejectedValue(new Error("Network Error"))
    render(<InvitationCard />)
    const items = await openMenu(live.email)
    await act(async () => void fireEvent.click(items.find((i) => i.textContent === "Resend")!))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't send it again",
      description: expect.stringMatching(/server could not be reached/),
      variant: "destructive",
    }))
  })

  it("revokes a live invitation, and only clears a joined one from the list", async () => {
    state.list = { data: { data: [live, joined] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<InvitationCard />)
    fireEvent.click((await openMenu(live.email)).at(-1)!)
    expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({
      title: "Revoke the invitation to elif@kestrel.example?",
      confirmText: "Revoke invitation",
    }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    show("Accepted")
    fireEvent.click((await openMenu(joined.email)).at(-1)!)
    const last = confirm.mock.calls.at(-1)?.[0]
    expect(last.title).toBe("Clear kwame@kestrel.example's invitation from the list?")
    expect(last.description).not.toMatch(/stops working/)
  })

  it("draws a pending invitation as a dashed outline, not a person", () => {
    state.list = { data: { data: [live] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { container } = render(<InvitationCard />)
    const mark = container.querySelector("[data-invite-avatar]") as HTMLElement
    expect(mark.getAttribute("data-invite-avatar")).toBe("pending")
    expect(mark.className).toContain("invite-avatar")
  })

  it("welcomes the first invitation with the 96px envelope spot", () => {
    state.list = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { container } = render(<InvitationCard />)
    const empty = container.querySelector("[data-people-state]") as HTMLElement
    expect(empty.textContent).toContain("Bring your team in")
    expect(empty.querySelector("[data-empty-illustration]")?.className).toContain("size-24")
  })
})

describe("an invitation accepted while the page is open", () => {
  it("turns into their face, says Joined just now, and celebrates the first acceptance ever", () => {
    state.list = { data: { data: [live] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { rerender, container } = render(<InvitationCard />)
    state.list = { ...state.list, data: { data: [{ ...live, status: "joined" }] } }
    rerender(<InvitationCard />)
    const mark = container.querySelector("[data-invite-avatar]") as HTMLElement
    expect(mark.getAttribute("data-invite-avatar")).toBe("joined")
    expect(mark.className).toContain("invite-joined")
    expect(screen.getByText("Joined just now")).toBeTruthy()
    expect(celebrate).toHaveBeenCalledTimes(1)
    expect(celebrate.mock.calls[0][0]).toBe(mark)
    expect(window.localStorage.getItem(FIRST_ACCEPT_KEY)).toBe("1")
  })

  it("does not celebrate when someone had joined by invitation before", () => {
    state.list = { data: { data: [live, joined] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { rerender } = render(<InvitationCard />)
    state.list = { ...state.list, data: { data: [{ ...live, status: "joined" }, joined] } }
    rerender(<InvitationCard />)
    expect(screen.getByText("Joined just now")).toBeTruthy()
    expect(celebrate).not.toHaveBeenCalled()
  })

  it("does not celebrate twice in this browser", () => {
    window.localStorage.setItem(FIRST_ACCEPT_KEY, "1")
    state.list = { data: { data: [live] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { rerender } = render(<InvitationCard />)
    state.list = { ...state.list, data: { data: [{ ...live, status: "joined" }] } }
    rerender(<InvitationCard />)
    expect(celebrate).not.toHaveBeenCalled()
  })

  it("is worked out from two reads of the list", () => {
    expect(newlyAccepted(undefined, [live], false)).toEqual({ ids: [], celebrate: false })
    expect(newlyAccepted([live], [{ ...live, status: "joined" }], false)).toEqual({ ids: ["i1"], celebrate: true })
    expect(newlyAccepted([live], [{ ...live, status: "joined" }], true).celebrate).toBe(false)
  })
})
