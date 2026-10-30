import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { SCREENS, putOnScreen, type ScreenName } from "@/lib/testing/screens"
import { pinTestClock } from "@/lib/testing/testClock"

// Pause notifications, design v3 (hub.md P5): a popover of 34px rows, each
// saying when it would end; Resume while paused; the agents note held back.

let paused: Date | null = null
const pause = vi.fn(async () => true)
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: paused, focusUntil: null, pause, resume: vi.fn(async () => true), busy: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))

const { PauseNotificationsDialog, pauseMenuLabel, pauseLeftLabel, pauseEndLabel, pauseUntilProblem, AGENT_MENTIONS_WAIT } = await import("@/components/notifications/PauseNotificationsDialog")
const LOAD = { timeout: 8000 }
// Every test on the one today (lib/testing/testClock); the custom end its own hour.
pinTestClock()

afterEach(async () => {
  cleanup()
  paused = null
  pause.mockClear()
  // Radix gives focus back from a closed scope a tick after it unmounts: let it.
  await new Promise((r) => setTimeout(r, 10))
})

describe("the pause popover (P5)", () => {
  it("is a popover of rows, a \"For …\" row saying when it would end", () => {
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(document.querySelector("[data-pause-popover]")).toBeTruthy()
    const rows = [...document.querySelectorAll("[data-pause-row]")]
    expect(rows[0].textContent).toMatch(/^For 30 minutes.+/)
    // An "Until …" row names its own end: no repeat beside it, which cut
    // "Until tomorrow, 9:00 AM" short (DESIGN-BUILD-3).
    for (const until of rows.filter((r) => /^Until /.test(r.textContent ?? ""))) expect(until.children).toHaveLength(1)
    expect(rows.at(-1)!.textContent).toBe("Custom…")
    fireEvent.click(rows[0])
    expect(pause).toHaveBeenCalledTimes(1)
  })

  // D14: the app's date and time fields, not the browser's datetime-local box.
  it("opens the app's date and time fields from Custom…", () => {
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(screen.queryByRole("group", { name: "Pause until" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Custom…" }))
    const group = screen.getByRole("group", { name: "Pause until" })
    expect(document.querySelector("input[type='datetime-local']")).toBeNull()
    expect(within(group).getByRole("button", { name: /^Date, / })).toBeTruthy()
    expect(within(group).getByRole("button", { name: /^Time, / })).toBeTruthy()
    // An hour ahead to begin with: a time the server takes.
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("offers Resume while paused, and the menu row says it", () => {
    paused = new Date(Date.now() + 80 * 60_000)
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(document.querySelector("[data-pause-resume]")).toBeTruthy()
    expect(pauseMenuLabel(paused)).toBe("Resume notifications")
    expect(pauseMenuLabel(null)).toBe("Pause notifications…")
  })

  it("says how long is left as the foot's pill does", () => {
    const now = new Date(2026, 9, 11, 10, 0)
    expect(pauseLeftLabel(new Date(2026, 9, 11, 11, 20), now)).toBe("Paused · 1 h 20 m")
    expect(pauseLeftLabel(new Date(2026, 9, 11, 10, 30), now)).toBe("Paused · 30 m")
    expect(pauseEndLabel(new Date(2026, 9, 11, 10, 30), now)).toMatch(/10:30/)
  })

  it("does not say agents' mentions wait until the backend confirms it", () => {
    expect(AGENT_MENTIONS_WAIT).toBe(false)
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(screen.queryByText("Mentions from agents wait too.")).toBeNull()
    expect(readFileSync(join(process.cwd(), "components/notifications/PauseNotificationsDialog.tsx"), "utf8")).toMatch(/AGENT_MENTIONS_WAIT \? /)
  })
})

// Pause until a moment of the person's own: the day and the time, picked in
// the shared fields, held to the server's week (CheckPauseEnd), and Pause says
// why it waits. It greyed out with no word.
describe("a custom end for a pause", () => {
  // Thursday 15 Oct 2026, 10:00 on this machine's clock.
  pinTestClock(new Date(2026, 9, 15, 10, 0))

  it("pauses until the moment picked", { timeout: 20000 }, async () => {
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Custom…" }))
    const group = screen.getByRole("group", { name: "Pause until" })
    expect(within(group).getByRole("button", { name: /^Time/ })).toHaveTextContent("11:00 AM")
    fireEvent.click(within(group).getByRole("button", { name: /^Time/ }))
    const list = await screen.findByRole("listbox", { name: "Time" }, LOAD)
    // Today's times start after now.
    expect(list.querySelector("[role='option']")).toHaveTextContent("10:15 AM")
    fireEvent.click(list.querySelector<HTMLElement>("[aria-selected='true']")!.nextElementSibling as HTMLElement)
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(pause).toHaveBeenCalledWith(new Date(2026, 9, 15, 11, 15))
  })

  it("says why a moment past the server's week can't be used, and waits", { timeout: 20000 }, async () => {
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Custom…" }))
    fireEvent.click(within(screen.getByRole("group", { name: "Pause until" })).getByRole("button", { name: /^Date/ }))
    const month = await screen.findByRole("grid", {}, LOAD)
    // A week on is the last day offered; its 11:00 AM is past the week's end.
    expect(Array.from(month.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === "23")?.disabled).toBe(true)
    fireEvent.click(Array.from(month.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "22")!)
    const why = await screen.findByText("Pick a time within the next 7 days.")
    const button = screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute("aria-describedby")).toBe(why.id)
    expect(screen.getByRole("group", { name: "Pause until" }).querySelector("[aria-describedby]")?.getAttribute("aria-describedby")).toBe(why.id)
  })

  it("holds a moment to a minute ahead and a week at most, as the server does", () => {
    const now = new Date(2026, 9, 15, 10, 0).getTime()
    expect(pauseUntilProblem(null, now)).toBe("Pick a date and time.")
    expect(pauseUntilProblem(new Date(now + 30_000), now)).toBe("Pick a time at least a minute from now.")
    expect(pauseUntilProblem(new Date(now + 7 * 86_400_000 + 60_000), now)).toBe("Pick a time within the next 7 days.")
    expect(pauseUntilProblem(new Date(now + 7 * 86_400_000), now)).toBeUndefined()
  })
})

// ONE SHEET RULE (20 Oct 2026): a phone held sideways is a phone. At 844px it
// is wider than isMobile's 640, so it got the popover of 34px rows; whether
// it's a sheet is components/ui/overlayMode's useSheetMode now.
describe("the pause menu, by screen", () => {
  let off = () => {}
  const on = (s: ScreenName) => {
    off = putOnScreen(SCREENS[s])
  }
  afterEach(() => {
    off()
    off = () => {}
  })

  it("is a sheet on a phone held sideways, Custom's Pause pinned in its footer", () => {
    on("a phone in landscape")
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(document.querySelector("[data-v3-sheet] [data-pause-menu]")).toBeTruthy()
    expect(document.querySelector("[data-pause-popover]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Custom…" }))
    expect(screen.getByRole("button", { name: "Pause" }).closest("[data-sheet-footer]")).toBeTruthy()
  })

  for (const phone of ["a phone in portrait", "a phone in landscape"] as const) {
    // The owner, 18 Oct: Pause's Custom was the browser's date-time box. Each
    // half opens as a panel of the sheet, with Back and its name, never a
    // second sheet over it, and Pause stays pinned in the footer.
    it(`on ${phone}, Custom's day and time open as panels of the sheet, Pause in its footer`, { timeout: 20000 }, async () => {
      on(phone)
      render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
      fireEvent.click(screen.getByRole("button", { name: "Custom…" }))
      const sheet = document.querySelector("[data-vaul-drawer]")
      fireEvent.click(within(screen.getByRole("group", { name: "Pause until" })).getByRole("button", { name: /^Date/ }))
      const month = await screen.findByRole("grid", {}, LOAD)
      expect(document.querySelectorAll("[data-vaul-drawer]")).toHaveLength(1)
      expect(month.closest("[data-sheet-panel]"), "a panel of the sheet").toBeTruthy()
      expect(month.closest("[data-vaul-drawer]")).toBe(sheet)
      expect(await screen.findByRole("heading", { name: "Date" }, LOAD)).toBeTruthy()
      expect(screen.getByRole("button", { name: "Back" })).toBeTruthy()
      expect(screen.getByRole("button", { name: "Pause" }).closest("[data-sheet-footer]")).toBeTruthy()
    })
  }

  it("stays a popover on a tablet", () => {
    on("a tablet")
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(document.querySelector("[data-pause-popover]")).toBeTruthy()
    expect(document.querySelector("[data-v3-sheet]")).toBeNull()
  })
})
