import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/components/reactionPicker/reactionPicker", () => ({ ReactionPicker: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/dialog/customExpirationCalendarDialog", () => ({ default: () => null }))
vi.mock("@/hooks/useStatusIsExpired", () => ({ useStatusIsExpired: () => false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
  useFetch: () => ({ data: { data: [] } }),
}))

let focusUntil: Date | null = null
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: null, focusUntil }) }))

let status: Record<string, unknown> | undefined
const dispatched: { type: string; payload: unknown }[] = []
vi.mock("react-redux", () => ({
  useSelector: (select: (s: unknown) => unknown) => select({ users: { usersStatus: { me: status ? { emojiStatus: status } : {} } } }),
  useDispatch: () => (a: { type: string; payload: unknown }) => dispatched.push(a),
}))
let request: () => Promise<unknown> = async () => ({})
const makeRequest = vi.fn((...args: unknown[]) => {
  void args
  return request()
})
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

import UpdateUserStatusDialog, { expiryWords } from "@/components/dialog/updateUserStatusDialog"

const setOpen = vi.fn()
const mount = () => render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)

beforeEach(() => {
  status = undefined
  focusUntil = null
  dispatched.length = 0
  makeRequest.mockClear()
  setOpen.mockClear()
  request = async () => ({})
})
afterEach(cleanup)

describe("the status menu", () => {
  it("closes on Escape", () => {
    mount()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  // With a status set, it offered only "Clear current status": no way to
  // change the words without clearing them first.
  it("lets a status that is set be changed, not only cleared", async () => {
    status = { status_user_emoji_id: "brain", status_user_emoji_desc: "Deep work", status_user_emoji_expiry_in: "4h" }
    mount()
    expect(screen.getByRole("button", { name: "Clear status" })).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox", { name: "Status" }), { target: { value: "Deep work, back at 3" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
    })
    expect(makeRequest).toHaveBeenCalledTimes(1)
    expect(dispatched[0].payload).toMatchObject({ userUUID: "me", status: { status_user_emoji_desc: "Deep work, back at 3" } })
  })

  it("shows a new status at once, and takes it back if the server refuses", async () => {
    request = () => Promise.reject(new Error("refused"))
    mount()
    fireEvent.change(screen.getByRole("textbox", { name: "Status" }), { target: { value: "Lunch" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Set status" }))
    })
    expect(setOpen).toHaveBeenCalledWith(false)
    expect(dispatched.map((a) => a.type)).toEqual(["users/updateUserEmojiStatus", "users/clearUserEmojiStatus"])
  })

  it("says when a status clears in words", () => {
    expect(expiryWords("30m")).toBe("30 minutes")
    expect(expiryWords("this_week")).toBe("This week")
    expect(expiryWords("custom", new Date(new Date().getFullYear(), 9, 12, 17, 0))).toBe("Until 12 Oct, 5:00\u00a0PM")
  })

  // Design v3, hub.md P3: a popover, not a modal.
  it("is a popover, with no Cancel button", () => {
    mount()
    expect(document.querySelector("[data-status-popover]")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()
  })

  // Asked for from the profile menu, whose row closes with the menu: with
  // nothing pressed left to anchor to, it opened at the top of the screen.
  it("opens beside the sidebar foot when what was pressed has gone", async () => {
    const { setLastAnchor } = await import("@/lib/hub/lastAnchor")
    const gone = document.createElement("div")
    setLastAnchor(gone)
    const foot = document.createElement("div")
    foot.setAttribute("data-sidebar-foot", "")
    foot.getBoundingClientRect = () => new DOMRect(8, 840, 232, 44)
    document.body.appendChild(foot)
    try {
      mount()
      const box = document.querySelector<HTMLElement>("[data-status-anchor]")!
      expect([box.style.left, box.style.top]).toEqual(["8px", "840px"])
      expect(document.querySelector("[data-status-popover]")!.getAttribute("data-side") ?? "right").toBe("right")
    } finally {
      foot.remove()
      setLastAnchor(null)
    }
  })

  it("shows the automatic row while focus time is on", () => {
    mount()
    expect(document.querySelector("[data-status-automatic]")).toBeNull()
    cleanup()
    focusUntil = new Date(Date.now() + 3_600_000)
    mount()
    const row = document.querySelector("[data-status-automatic]")!
    expect(row.textContent).toMatch(/^In focus until .*Automatic$/)
  })

  it("sets Clear after to the suggestion's duration", () => {
    mount()
    expect(document.querySelector('[data-clear-after="30m"]')!.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: /Deep work/ }))
    expect(document.querySelector('[data-clear-after="4h"]')!.getAttribute("aria-checked")).toBe("true")
    expect((screen.getByRole("textbox", { name: "Status" }) as HTMLInputElement).value).toBe("Deep work")
  })

  it("offers In a call and Focus time among the suggestions", () => {
    mount()
    const names = [...document.querySelectorAll("[data-status-suggestion]")].map((b) => b.textContent)
    expect(names.some((n) => n?.includes("In a call"))).toBe(true)
    expect(names.some((n) => n?.includes("Focus time"))).toBe(true)
  })

  it("keeps Set status disabled while the status is empty", () => {
    mount()
    expect((screen.getByRole("button", { name: "Set status" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox", { name: "Status" }), { target: { value: "Out" } })
    expect((screen.getByRole("button", { name: "Set status" }) as HTMLButtonElement).disabled).toBe(false)
  })
})
