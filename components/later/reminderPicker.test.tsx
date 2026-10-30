import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { SCREENS, putOnScreen } from "@/lib/testing/screens"

// Remind me (Save for later's Pick a date and time…): a day and a time in the
// app's own fields (D14), within the server's year. It was the browser's
// datetime-local box, mm/dd/yyyy with a clock of its own, in a dialog that
// stayed a dialog on a phone.

const save = vi.fn(async () => undefined)
const remind = vi.fn(async () => undefined)
vi.mock("@/hooks/useLater", () => ({
  useSavedEntry: () => undefined,
  useLaterActions: () => ({ save, remind, done: vi.fn(), remove: vi.fn() }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))

const { default: ReminderPicker } = await import("@/components/later/reminderPicker")
const { SaveForLaterButton } = await import("@/components/later/SaveForLater")
const { TooltipProvider } = await import("@/components/ui/tooltip")

const LOAD = { timeout: 8000 }
// Thursday 15 Oct 2026, 10:00 on this machine's clock.
pinTestClock(new Date(2026, 9, 15, 10, 0))

let undo = () => {}
afterEach(async () => {
  cleanup()
  undo()
  undo = () => {}
  save.mockClear()
  remind.mockClear()
  await new Promise((r) => setTimeout(r, 10))
})

const fields = () => screen.getByRole("group", { name: "Reminder date and time" })

describe("Remind me, on a computer", () => {
  it("is a dialog of the app's date and time fields, from tomorrow morning", () => {
    const onPick = vi.fn()
    render(<ReminderPicker onPick={onPick} onClose={() => {}} />)
    const dialog = screen.getByRole("dialog", { name: "Remind me" })
    expect(dialog.querySelector("input[type='datetime-local']")).toBeNull()
    expect(within(fields()).getByRole("button", { name: /^Date/ })).toHaveTextContent("Fri 16 Oct 2026")
    expect(within(fields()).getByRole("button", { name: /^Time/ })).toHaveTextContent("9:00 AM")
    fireEvent.click(screen.getByRole("button", { name: "Set reminder" }))
    expect(onPick).toHaveBeenCalledWith(new Date(2026, 9, 16, 9, 0))
  })

  it("starts from the reminder already set, while it is still ahead", () => {
    render(<ReminderPicker initial={new Date(2026, 9, 20, 14, 30)} onPick={() => {}} onClose={() => {}} />)
    expect(within(fields()).getByRole("button", { name: /^Date/ })).toHaveTextContent("Tue 20 Oct 2026")
    expect(within(fields()).getByRole("button", { name: /^Time/ })).toHaveTextContent("2:30 PM")
  })

  it("moves a day picked for today past now, and says why a passed time can't be set", { timeout: 20000 }, async () => {
    const onPick = vi.fn()
    render(<ReminderPicker onPick={onPick} onClose={() => {}} />)
    fireEvent.click(within(fields()).getByRole("button", { name: /^Date/ }))
    const month = await screen.findByRole("grid", {}, LOAD)
    fireEvent.click(Array.from(month.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "15")!)
    // Radix gives the focus back to the day a tick after its picker closes.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    // Today at 9:00 had passed: the first quarter hour after now.
    expect(within(fields()).getByRole("button", { name: /^Time/ })).toHaveTextContent("10:15 AM")
    fireEvent.click(within(fields()).getByRole("button", { name: /^Time/ }))
    const box = await screen.findByLabelText("Type a time", {}, LOAD)
    fireEvent.change(box, { target: { value: "9:30" } })
    fireEvent.keyDown(box, { key: "Enter" })
    const why = await screen.findByText("Choose a time that has not passed yet.")
    const set = screen.getByRole("button", { name: "Set reminder" }) as HTMLButtonElement
    expect(set.disabled).toBe(true)
    expect(set.getAttribute("aria-describedby")).toBe(why.id)
    fireEvent.click(set)
    expect(onPick).not.toHaveBeenCalled()
  })

  it("opens from Save for later's Pick a date and time…, and saves with the reminder", { timeout: 20000 }, async () => {
    render(
      <TooltipProvider>
        <SaveForLaterButton target={{ itemType: "chat", itemId: "m1", link: "/app/chat/c1/m1", title: "The launch note" }} />
      </TooltipProvider>,
    )
    const bookmark = () => document.querySelector<HTMLElement>('[aria-label="Save for later"]')!
    expect(bookmark().getAttribute("data-tone")).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "Save for later" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Pick a date and time/ }))
    await screen.findByRole("dialog", { name: "Remind me" }, LOAD)
    // Behind Remind me the bookmark tints in ink, not a second orange thing beside Set reminder (DESIGN-BUILD-3).
    expect(bookmark().getAttribute("data-tone")).toBe("neutral")
    fireEvent.click(screen.getByRole("button", { name: "Set reminder" }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ item_id: "m1", remind_at: new Date(2026, 9, 16, 9, 0).toISOString() }))
    expect(screen.queryByRole("dialog", { name: "Remind me" })).toBeNull()
    expect(bookmark().getAttribute("data-tone")).toBeNull()
  })
})

for (const phone of ["a phone in portrait", "a phone in landscape"] as const) {
  describe(`Remind me, on ${phone}`, () => {
    // The phone's sheet (ResponsiveDialog): its actions pinned in the footer,
    // each field's picker a panel of the sheet, never a second sheet over it.
    it("is the sheet, Set reminder in its footer, the day a panel of it", { timeout: 20000 }, async () => {
      undo = putOnScreen(SCREENS[phone])
      render(<ReminderPicker onPick={() => {}} onClose={() => {}} />)
      const set = await screen.findByRole("button", { name: "Set reminder" }, LOAD)
      expect(set.closest("[data-sheet-footer]"), "Set reminder pinned in the footer").toBeTruthy()
      const sheet = set.closest("[data-vaul-drawer]")
      fireEvent.click(within(fields()).getByRole("button", { name: /^Date/ }))
      const month = await screen.findByRole("grid", {}, LOAD)
      expect(document.querySelectorAll("[data-vaul-drawer]")).toHaveLength(1)
      expect(month.closest("[data-sheet-panel]"), "a panel of the sheet").toBeTruthy()
      expect(month.closest("[data-vaul-drawer]")).toBe(sheet)
      expect(await screen.findByRole("heading", { name: "Date" }, LOAD)).toBeTruthy()
    })
  })
}
