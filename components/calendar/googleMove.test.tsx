import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { GoogleSync } from "@/lib/calendar/googleSync"

const fetched = vi.hoisted(() => ({ value: undefined as { data?: GoogleSync } | undefined, mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: fetched.value, mutate: fetched.mutate }) }))
const move = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: async (...a: unknown[]) => ({ data: { data: await move(...a) } }) } }))

import { CalendarsPanel } from "./calendarsPopover"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()
afterEach(() => {
  cleanup()
  move.mockReset()
  fetched.mutate.mockReset()
})

const sync = (p: Partial<GoogleSync>): GoogleSync => ({ provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0, ...p })
const panel = (onImported = vi.fn()) =>
  render(
    <CalendarsPanel anchor={new Date(2026, 9, 15)} view="week" hasItems={() => false} onPick={vi.fn()} rows={[]} onBookingPages={vi.fn()}
      googleConnected googleAccount="sam@gmail.com" onImported={onImported} />,
  )

// Calendar B6: one click moves every Google calendar, then both stay in step.
describe("moving from Google", () => {
  it("offers the move once Google is connected, and starts it", async () => {
    fetched.value = { data: sync({}) }
    move.mockResolvedValue(sync({ state: "moving", progress: 0 }))
    panel()
    fireEvent.click(screen.getByRole("button", { name: "Move everything from Google" }))
    await waitFor(() => expect(move).toHaveBeenCalled())
    expect(fetched.mutate).toHaveBeenCalledWith({ data: sync({ state: "moving", progress: 0 }) }, { revalidate: false })
  })

  // DESIGN-BUILD-3, 20 Oct 2026: the group led with Disconnect, and the move
  // was a plain row with Import and export's arrows under it.
  it("names Google with its mark, its account and how it stands, then the move with an icon of its own, and Disconnect last", () => {
    fetched.value = { data: sync({}) }
    panel()
    const group = document.querySelector("[data-google-sync]") as HTMLElement
    const status = group.querySelector("[data-google-account]") as HTMLElement
    expect(group.textContent?.startsWith("Google Calendar")).toBe(true)
    expect(status.textContent).toBe("sam@gmail.com")
    const move = screen.getByRole("button", { name: "Move everything from Google" })
    const disconnect = screen.getByRole("button", { name: "Disconnect Google Calendar" })
    expect(group.contains(move) && group.contains(disconnect)).toBe(true)
    expect(status.compareDocumentPosition(move) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(move.compareDocumentPosition(disconnect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const importExport = screen.getByRole("button", { name: "Import and export" })
    expect(move.querySelector("svg")?.getAttribute("class")).not.toBe(importExport.querySelector("svg")?.getAttribute("class"))
  })

  it("shows the move's progress, then that both are in step, and the calendar reads what came", () => {
    fetched.value = { data: sync({ state: "moving", progress: 45 }) }
    const imported = vi.fn()
    const { rerender } = panel(imported)
    expect(screen.getByRole("status").textContent).toBe("sam@gmail.com · Moving from Google · 45%")
    expect(screen.queryByRole("button", { name: "Move everything from Google" })).toBeNull()
    fetched.value = { data: sync({ state: "synced", progress: 100, moved: 120, last_synced_at: new Date(Date.now() - 120000).toISOString() }) }
    rerender(
      <CalendarsPanel anchor={new Date(2026, 9, 15)} view="week" hasItems={() => false} onPick={vi.fn()} rows={[]} onBookingPages={vi.fn()}
        googleConnected googleAccount="sam@gmail.com" onImported={imported} />,
    )
    expect(screen.getByRole("status").textContent).toBe("sam@gmail.com · In step with Google · 2m ago")
    expect(imported).toHaveBeenCalled()
  })

  // C9: when Google stops answering for the account, the panel says so and
  // offers to connect Google again, not a move. DESIGN-BUILD-8's should-fixes:
  // said once, on the account line, in danger ink; and connecting again is
  // the one thing to do, in brand ink with an icon of its own (the link icon
  // is the feed's).
  it("says once, on the account line, that Google stopped answering, and makes connecting it again the thing to do", () => {
    fetched.value = { data: sync({ state: "broken", error: "Google stopped answering for this account. Connect it again." }) }
    panel()
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("sam@gmail.com · Google stopped answering")
    expect(status.className).toMatch(/\btext-danger-ink\b/)
    expect(screen.getAllByText(/stopped answering/)).toHaveLength(1)
    expect(screen.queryByRole("alert")).toBeNull()
    const again = screen.getByRole("button", { name: "Connect Google again" })
    expect(again.className).toMatch(/\btext-brand-text\b/)
    expect(again.querySelector("svg")?.getAttribute("class")).toMatch(/lucide-plug\b/)
    expect(screen.queryByRole("button", { name: /from Google/ })).toBeNull()
  })

  it("says why a move failed, and offers it again", () => {
    fetched.value = { data: sync({ state: "failed", error: "Your Google calendars couldn't be read. Connect Google again, then try once more." }) }
    panel()
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't be read/)
    expect(screen.getByRole("button", { name: "Try the move from Google again" })).toBeTruthy()
  })
})
