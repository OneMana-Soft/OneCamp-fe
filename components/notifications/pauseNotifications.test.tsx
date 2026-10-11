import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Pause notifications, design v3 (hub.md P5): a popover of 34px rows, each
// saying when it would end; Resume while paused; the agents note held back.

let paused: Date | null = null
const pause = vi.fn(async () => true)
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil: paused, focusUntil: null, pause, resume: vi.fn(async () => true), busy: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))

const { PauseNotificationsDialog, pauseMenuLabel, pauseLeftLabel, pauseEndLabel, AGENT_MENTIONS_WAIT } = await import("@/components/notifications/PauseNotificationsDialog")

afterEach(() => {
  cleanup()
  paused = null
  pause.mockClear()
})

describe("the pause popover (P5)", () => {
  it("is a popover of rows, each with when it would end", () => {
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(document.querySelector("[data-pause-popover]")).toBeTruthy()
    const rows = [...document.querySelectorAll("[data-pause-row]")]
    expect(rows[0].textContent).toMatch(/^For 30 minutes.+/)
    expect(rows.at(-1)!.textContent).toBe("Custom…")
    fireEvent.click(rows[0])
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it("opens a time field from Custom…", () => {
    render(<PauseNotificationsDialog open onOpenChange={() => {}} />)
    expect(screen.queryByLabelText("Pause until")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Custom…" }))
    expect(screen.getByLabelText("Pause until")).toBeTruthy()
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
