import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// Notifications (design v3, admin S2). ONE save model, instant: every switch,
// checkbox and choice saves the moment it changes, sends only its own field,
// and says "Saved" on its row; a failure puts the control back and says the
// server's reason on the row. The email section used to wait for a Save at the
// foot of the page while the rest of the page saved at once.
//
// With email off, the event rows dim and disable under one line, and stay
// where they are. Every width has the same control for an event, a switch:
// a computer's was a one-column table of checkboxes (QA F-33).
//
// The card shares its request with Read receipts, which updates the shared
// answer: a change in flight must survive that.

const { state, post, wide } = vi.hoisted(() => ({
  state: { fetch: {} as Record<string, unknown> },
  post: vi.fn(),
  wide: { on: false },
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => state.fetch }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))

import { NotificationPreferencesCard } from "./NotificationPreferencesCard"

const prefs = {
  email_supported: true,
  email_enabled: true,
  email_mentions: true,
  email_dms: true,
  email_task_assigned: true,
  email_task_status: true,
  email_comments: true,
  email_calls: true,
  email_channel_invites: true,
  email_only_when_offline: true,
  email_digest_frequency: "off",
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_tz: null,
  read_receipts: true,
  read_receipts_allowed: true,
}

const mutate = vi.fn(async () => undefined)
const answered = (over: Record<string, unknown> = {}) => ({
  data: { data: { ...prefs, ...over }, status: "success" },
  isLoading: false,
  isError: undefined,
  mutate,
})

beforeEach(() => {
  state.fetch = answered()
  post.mockReset()
  mutate.mockClear()
  wide.on = false
  window.matchMedia = ((q: string) => ({
    matches: q.includes("720") ? wide.on : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

const mentions = () => screen.getByRole("switch", { name: "Mentions" })

describe("one save model: instant", () => {
  it("saves a switch the moment it changes, sending only that field, and ticks the row", async () => {
    post.mockResolvedValue({})
    render(<NotificationPreferencesCard />)
    await act(async () => void fireEvent.click(mentions()))
    expect(post).toHaveBeenCalledTimes(1)
    const [, payload, config] = post.mock.calls[0]
    expect(payload).toEqual({ email_mentions: false })
    expect(config).toEqual({ suppressErrorToast: true })
    expect(mutate).toHaveBeenCalled()
    expect(mentions().closest("[data-setting-row]")?.querySelector("[data-saved-tick]")).not.toBeNull()
    // No Save button and no dock: nothing waits.
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  })

  it("puts the switch back and says the server's reason on the row when a save fails", async () => {
    post.mockRejectedValue({ response: { status: 503, data: { msg: "The server is restarting." } } })
    render(<NotificationPreferencesCard />)
    await act(async () => void fireEvent.click(mentions()))
    await waitFor(() => expect(mentions()).toHaveAttribute("aria-checked", "true"))
    expect(mentions().closest("[data-setting-row]")).toHaveTextContent("The server is restarting.")
  })

  // A refused toggle said "boom" under its label, the server's raw words, and
  // nothing said the change didn't hold (QA F-25).
  it("says a refused save wasn't saved, in plain words, never the server's raw error", async () => {
    post.mockRejectedValue({ response: { status: 500, data: { error: "pq: deadlock detected" } } })
    render(<NotificationPreferencesCard />)
    await act(async () => void fireEvent.click(mentions()))
    const row = mentions().closest("[data-setting-row]") as HTMLElement
    // A server fault says the caller's own words (lib/utils/apiError), never its developer text.
    await waitFor(() => expect(row).toHaveTextContent("Not saved. Try again in a moment."))
    expect(row).not.toHaveTextContent("pq:")
  })

  it("keeps a change in flight when Read receipts updates the shared answer", async () => {
    let answer: (v: unknown) => void = () => {}
    post.mockReturnValue(new Promise((r) => (answer = r)))
    const { rerender } = render(<NotificationPreferencesCard />)
    fireEvent.click(mentions())
    state.fetch = answered({ read_receipts: false })
    rerender(<NotificationPreferencesCard />)
    expect(mentions()).toHaveAttribute("aria-checked", "false")
    await act(async () => answer({}))
  })

  it("saves the quiet-hours times 600ms after the last pick", { timeout: 20000 }, async () => {
    post.mockResolvedValue({})
    state.fetch = answered({ quiet_hours_enabled: true, quiet_hours_start: "22:00", quiet_hours_end: "07:00", quiet_hours_tz: "Asia/Kolkata" })
    render(<NotificationPreferencesCard />)
    // The time field (components/ui/date-field): open it, type a time, Enter.
    const pick = async (time: string) => {
      fireEvent.click(screen.getByLabelText("From"))
      // The panel is its own chunk, loaded on first open.
      const box = await screen.findByLabelText("Type a time", {}, { timeout: 8000 })
      fireEvent.change(box, { target: { value: time } })
      fireEvent.keyDown(box, { key: "Enter" })
    }
    await pick("21:00")
    await pick("21:30")
    expect(post).not.toHaveBeenCalled()
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(post.mock.calls[0][1]).toEqual({ quiet_hours_start: "21:30" })
  })
})

describe("the email master switch", () => {
  it("dims and disables the event rows when off, with one line, and keeps them on the page", () => {
    state.fetch = answered({ email_enabled: false })
    render(<NotificationPreferencesCard />)
    expect(screen.getByText("Turned off for every email.")).toBeInTheDocument()
    const events = document.querySelector("[data-email-events]")!
    expect(events.querySelector(".opacity-50")).not.toBeNull()
    expect(mentions()).toBeDisabled()
    expect(screen.getAllByRole("switch").length).toBeGreaterThanOrEqual(9)
  })

  // DESIGN-BUILD-9 on the settings shots, 23 Oct: with email off, the digest
  // still said "Arrives each morning", a promise the off switch breaks.
  it("says no digest comes while email is off, whatever the digest is set to", () => {
    state.fetch = answered({ email_enabled: false, email_digest_frequency: "daily" })
    render(<NotificationPreferencesCard />)
    expect(screen.getByRole("radiogroup", { name: "Activity digest" })).toHaveAccessibleDescription("No digest while email is off.")
  })
})

describe("one control for an event, on every width (QA F-33)", () => {
  it.each([true, false])("is a switch per event, wide: %s", (on) => {
    wide.on = on
    render(<NotificationPreferencesCard />)
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(mentions()).toHaveAttribute("aria-checked", "true")
  })

  it("saves an event's switch like any other change", async () => {
    wide.on = true
    post.mockResolvedValue({})
    render(<NotificationPreferencesCard />)
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Calls" })))
    expect(post.mock.calls[0][1]).toEqual({ email_calls: false })
  })
})

describe("the digest and quiet hours", () => {
  it("makes the digest a choice of one with a line that changes with it", async () => {
    // Held in flight, so the choice shows before the answer comes back.
    post.mockReturnValue(new Promise(() => {}))
    render(<NotificationPreferencesCard />)
    const group = screen.getByRole("radiogroup", { name: "Activity digest" })
    expect(group).toHaveAccessibleDescription(/No digest/)
    await act(async () => void fireEvent.click(within(group).getByRole("radio", { name: "Weekly" })))
    expect(post.mock.calls[0][1]).toEqual({ email_digest_frequency: "weekly" })
    expect(group).toHaveAccessibleDescription(/Mondays/)
  })

  it("reveals the time range and the 24-hour bar when quiet hours are on", () => {
    state.fetch = answered({ quiet_hours_enabled: true, quiet_hours_start: "22:00", quiet_hours_end: "07:00", quiet_hours_tz: "Asia/Kolkata" })
    render(<NotificationPreferencesCard />)
    expect(screen.getByLabelText("From")).toHaveTextContent(/22:00|10:00\s?pm/i)
    expect(screen.getByLabelText("Until")).toHaveTextContent(/07:00|7:00\s?am/i)
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Kolkata")
    const bar = document.querySelector("[data-quiet-bar]")!
    // 22:00 to 07:00 runs past midnight: two pieces, and a tick for now.
    expect(bar.querySelectorAll("[data-quiet-span]")).toHaveLength(2)
    expect(bar.querySelector("[data-now-tick]")).not.toBeNull()
  })

  it("carries the ids Search settings lands on", () => {
    render(<NotificationPreferencesCard />)
    for (const id of ["notifications-email", "notifications-digest", "notifications-quiet"]) expect(document.getElementById(id), id).not.toBeNull()
  })
})

describe("before the settings arrive", () => {
  it("holds their shape while loading, with nothing to switch yet", () => {
    state.fetch = { data: undefined, isLoading: true, isError: undefined, mutate }
    render(<NotificationPreferencesCard />)
    expect(screen.getByRole("status", { name: "Loading your notification settings" })).toBeInTheDocument()
    expect(screen.queryByRole("switch")).toBeNull()
  })

  it("says the load failed, and offers to try again, rather than that email is off", () => {
    state.fetch = { data: undefined, isLoading: false, isError: new Error("Network Error"), mutate }
    render(<NotificationPreferencesCard />)
    expect(screen.getByText("Couldn't load your notification settings.")).toBeInTheDocument()
    expect(screen.queryByText(/hasn.t turned email on/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(mutate).toHaveBeenCalled()
  })

  it("still says when email is genuinely off on this server", () => {
    state.fetch = answered({ email_supported: false })
    render(<NotificationPreferencesCard />)
    expect(screen.getByText(/hasn.t turned email on/)).toBeInTheDocument()
  })
})
