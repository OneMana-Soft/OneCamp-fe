import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"
import { SCREENS, putOnScreen } from "@/lib/testing/screens"

// "Clear after → Custom": a day and a time in the status itself, the shared
// date and time fields (D14). It was a dialog with no title over the menu: on
// a computer it took the focus from the popover, which closed and took the
// dialog with it; on a phone it sat over the sheet, its picker a popover over
// that, off the screen's edge (the owner, 17 Oct: "custom date/time for
// mobile looks broken"). The real menu, sheet, fields and pickers here.

pinTestClock()

const media = { isMobile: false, isDesktop: true, isTablet: false }
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => media, PHONE_QUERY: "(max-width: 639px)" }))
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
const LOAD = { timeout: 8000 }
/** An hour on from the pinned now (12:00 UTC), on the quarter: what Custom offers first. */
const AN_HOUR_ON = Date.UTC(2026, 9, 15, 13, 0, 0) / 1000

beforeEach(() => {
  dispatched.length = 0
  makeRequest.mockClear()
  setOpen.mockClear()
})
afterEach(async () => {
  cleanup()
  // Radix gives focus back from a closed scope a tick after it unmounts: let it.
  await new Promise((r) => setTimeout(r, 10))
})

/** Picks the quarter hour after the one chosen, in the time field's list; `seen` looks at the list first. */
async function aQuarterLater(seen?: (list: HTMLElement) => void) {
  fireEvent.click(screen.getByRole("button", { name: /^Clears at/ }))
  const list = await screen.findByRole("listbox", { name: "Time" }, LOAD)
  seen?.(list)
  const chosen = list.querySelector<HTMLElement>("[aria-selected='true']")!
  fireEvent.click(chosen.nextElementSibling as HTMLElement)
}

async function setStatus() {
  // Found once the picker's sheet has gone: until then the rest is hidden from a reader.
  const set = await screen.findByRole("button", { name: "Set status" }, LOAD)
  await act(async () => {
    fireEvent.click(set)
  })
  return (makeRequest.mock.calls[0][0] as { payload: Record<string, string> }).payload
}

describe("a custom end for a status, on a computer", () => {
  beforeEach(() => {
    Object.assign(media, { isMobile: false, isDesktop: true })
  })

  it("is a day and a time in the menu, whose pickers keep the menu open", { timeout: 20000 }, async () => {
    render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)
    fireEvent.change(screen.getByRole("textbox", { name: "Status" }), { target: { value: "Out for the afternoon" } })
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }))
    expect(document.querySelector('[data-clear-after="custom"]')!.getAttribute("aria-checked")).toBe("true")
    expect(document.querySelector("[data-status-custom]")).toBeTruthy()
    // No dialog: the menu's only box is itself.
    expect(screen.queryByRole("button", { name: "Set expiration" })).toBeNull()
    expect(screen.getByRole("button", { name: /^Clears on, / })).toBeTruthy()

    await aQuarterLater()
    expect(setOpen).not.toHaveBeenCalledWith(false)
    expect(document.querySelector("[data-status-popover]")).toBeTruthy()

    const payload = await setStatus()
    expect(payload.emoji_expiry_time_in).toBe("custom")
    expect(payload.emoji_expiry_time_at).toBe(String(AN_HOUR_ON + 15 * 60))
    // Kept in the store as the server sends it back, an ISO date.
    expect(dispatched[0].payload).toMatchObject({ status: { status_user_emoji_expiry_at: "2026-10-15T13:15:00.000Z" } })
  })

  it("offers only the times still to come today, and won't save one that has passed", { timeout: 20000 }, async () => {
    render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)
    fireEvent.change(screen.getByRole("textbox", { name: "Status" }), { target: { value: "Back soon" } })
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }))
    fireEvent.click(screen.getByRole("button", { name: /^Clears at/ }))
    const list = await screen.findByRole("listbox", { name: "Time" }, LOAD)
    const first = list.querySelector<HTMLElement>("[role='option']")!
    // The first time offered is the first quarter hour after now, with no "how long" beside it.
    expect(first.querySelectorAll("span")).toHaveLength(1)
    // A time typed that has gone: said so, and Set status waits.
    const box = screen.getByLabelText("Type a time")
    fireEvent.change(box, { target: { value: "00:15" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(await screen.findByText("That time has passed. Pick a later one.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Set status" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

for (const phone of ["a phone in portrait", "a phone in landscape"] as const) {
  describe(`a custom end for a status, on ${phone}`, () => {
    let undo: () => void = () => {}
    beforeEach(() => {
      // The status reads the phone rule (components/ui/overlay), as the shared fields do.
      Object.assign(media, { isMobile: phone === "a phone in portrait", isDesktop: phone !== "a phone in portrait" })
      undo = putOnScreen(SCREENS[phone])
    })
    afterEach(() => undo())

    // The owner, 18 Oct: "in case of custom date time picker in status we get
    // popup in mobile". Each field opened a second, untitled sheet stacked
    // over the status sheet; in landscape the status was a popover and its
    // pickers popovers over it, run off the top of the screen.
    it("stays in the status sheet: each field opens as a panel of it, with Back and the field's name", { timeout: 20000 }, async () => {
      render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)
      fireEvent.change(screen.getByRole("textbox", { name: "Status" }), { target: { value: "Out for the afternoon" } })
      fireEvent.click(screen.getByRole("radio", { name: "Custom" }))
      // Nothing but the status sheet: no dialog, no popover.
      const others = () => Array.from(document.querySelectorAll("[role='dialog']")).filter((d) => !d.hasAttribute("data-vaul-drawer"))
      expect(others()).toEqual([])
      const status = document.querySelector("[data-status-custom]")!.closest("[data-vaul-drawer]")
      expect(status).toBeTruthy()

      await aQuarterLater((list) => {
        // The quarter hours flow in the status sheet's own body, as a panel of it.
        expect(document.querySelectorAll("[data-vaul-drawer]")).toHaveLength(1)
        expect(list.closest("[data-vaul-drawer]")).toBe(status)
        expect(list.closest("[data-sheet-panel]")).toBeTruthy()
        expect(list.className).not.toMatch(/\bh-40\b|overflow-y-auto/)
        expect(document.querySelector("[data-sheet-panel]")!.getAttribute("role")).toBe("region")
        // Set status stays in the footer while the panel is open.
        expect(screen.getByRole("button", { name: "Set status" }).closest("[data-sheet-footer]")).toBeTruthy()
        expect(others()).toEqual([])
      })
      // The pick took the panel away and left the form as it was.
      expect(document.querySelector("[data-sheet-panel]")).toBeNull()
      expect((screen.getByRole("textbox", { name: "Status" }) as HTMLInputElement).value).toBe("Out for the afternoon")

      const payload = await setStatus()
      expect(payload.emoji_expiry_time_in).toBe("custom")
      expect(payload.emoji_expiry_time_at).toBe(String(AN_HOUR_ON + 15 * 60))
    })

    it("opens the day as a panel too, the month the sheet's width, and Back takes it away", { timeout: 20000 }, async () => {
      render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)
      fireEvent.click(screen.getByRole("radio", { name: "Custom" }))
      fireEvent.click(screen.getByRole("button", { name: /^Clears on/ }))
      const grid = await screen.findByRole("grid", {}, LOAD)
      expect(grid.closest("[data-sheet-panel]")).toBeTruthy()
      expect((await screen.findByRole("heading", { name: "Clears on" }, { timeout: 8000 }))).toBeTruthy()
      // A finger's 44px a day, across the sheet.
      expect(grid.querySelector("button[name='day']")!.className).toContain("size-11")
      fireEvent.click((await screen.findByRole("button", { name: "Back" }, { timeout: 8000 })))
      await act(async () => {})
      expect(document.querySelector("[data-sheet-panel]")).toBeNull()
      expect(screen.getByRole("radio", { name: "Custom" }).getAttribute("aria-checked")).toBe("true")
    })

    it("lists its suggestions in the sheet's one scroller, inside its sides, and keeps its actions out of it", () => {
      render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)
      const suggestions = screen.getByRole("group", { name: "Suggestions" })
      expect(suggestions.className).not.toMatch(/max-h-|overflow-y-auto|-mx-/)
      expect(suggestions.closest("[data-sheet-body]")).toBeTruthy()
      const set = screen.getByRole("button", { name: "Set status" })
      expect(set.closest("[data-sheet-body]")).toBeNull()
      expect(set.closest("[data-sheet-footer]")).toBeTruthy()
    })
  })
}

describe("a custom end for a status, on a tablet", () => {
  let undo: () => void = () => {}
  beforeEach(() => {
    Object.assign(media, { isMobile: false, isDesktop: true })
    undo = putOnScreen(SCREENS["a tablet"])
  })
  afterEach(() => undo())

  it("is the menu, its actions in its footer and out of its scroller, its pickers by their fields", { timeout: 20000 }, async () => {
    render(<UpdateUserStatusDialog dialogOpenState setOpenState={setOpen} userUUID="" />)
    const menu = document.querySelector("[data-status-popover]") as HTMLElement
    expect(menu).toBeTruthy()
    expect(document.querySelector("[data-vaul-drawer]")).toBeNull()
    const set = screen.getByRole("button", { name: "Set status" })
    expect(set.closest("[data-overlay-footer]")).toBeTruthy()
    expect(set.closest("[data-overlay-body]")).toBeNull()
    expect(menu.className).not.toMatch(/overflow-y-auto|max-h-/)
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }))
    await aQuarterLater((list) => {
      expect(list.closest("[data-radix-popper-content-wrapper]")).toBeTruthy()
      expect(document.querySelector("[data-vaul-drawer]")).toBeNull()
    })
    expect(document.querySelector("[data-status-popover]")).toBeTruthy()
  })
})
