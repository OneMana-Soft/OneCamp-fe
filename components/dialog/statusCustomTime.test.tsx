import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// "Clear after → Custom" on a computer: the status menu is a popover, and the
// date dialog it opened sat beside it. Taking the focus, the dialog read as
// "outside" the popover, which closed, and closed the dialog with it: no
// custom time could be set. The real popover and the real date dialog here.

pinTestClock()

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/components/reactionPicker/reactionPicker", () => ({ ReactionPicker: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/hooks/useStatusIsExpired", () => ({ useStatusIsExpired: () => false }))
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil: null }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
  useFetch: () => ({ data: { data: [] } }),
}))

const dispatched: { type: string; payload: unknown }[] = []
vi.mock("react-redux", () => ({
  useSelector: (select: (s: unknown) => unknown) => select({ users: { usersStatus: { me: {} } } }),
  useDispatch: () => (a: { type: string; payload: unknown }) => dispatched.push(a),
}))
const makeRequest = vi.fn(async (...args: unknown[]) => {
  void args
  return {}
})
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

const { default: UpdateUserStatusDialog } = await import("@/components/dialog/updateUserStatusDialog")

const setOpen = vi.fn()

beforeEach(() => {
  dispatched.length = 0
  makeRequest.mockClear()
  setOpen.mockClear()
})
afterEach(cleanup)

describe("a custom time for a status, on a computer", () => {
  it("opens the date picker over the menu, keeps the menu, and saves the time chosen", async () => {
    render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)
    fireEvent.change(screen.getByRole("textbox", { name: "Status" }), { target: { value: "Out for the afternoon" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Custom" }))
    })
    const picker = await screen.findByRole("dialog")
    expect(setOpen).not.toHaveBeenCalledWith(false)
    expect(document.querySelector("[data-status-popover]")).toBeTruthy()

    await act(async () => {
      fireEvent.click(within(picker).getByRole("button", { name: "Set expiration" }))
    })
    const custom = document.querySelector('[data-clear-after="custom"]')!
    expect(custom.getAttribute("aria-checked")).toBe("true")
    expect(custom.textContent).toMatch(/^Until /)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Set status" }))
    })
    const payload = (makeRequest.mock.calls[0][0] as { payload: Record<string, string> }).payload
    expect(payload.emoji_expiry_time_in).toBe("custom")
    // Today 12:00 UTC, and the picker offers an hour on: sent in epoch seconds.
    expect(payload.emoji_expiry_time_at).toBe(String(Date.UTC(2026, 9, 15, 13, 0, 0) / 1000))
    // Kept in the store as the server sends it back, an ISO date.
    expect(dispatched[0].payload).toMatchObject({ status: { status_user_emoji_expiry_at: "2026-10-15T13:00:00.000Z" } })
  })
})
