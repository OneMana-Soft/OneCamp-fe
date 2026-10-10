import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// The email and quiet-hours card keeps what the person changed until they save
// or put it back. It shares its request with the Read receipts card, which
// saves the moment it is switched and updates the shared answer: the card used
// to copy that answer over its own working copy, so switching Read receipts
// wiped every unsaved change on the page, and the save bar with it.

const { state, post, toast } = vi.hoisted(() => ({
  state: { fetch: {} as Record<string, unknown> },
  post: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => state.fetch }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: post, isSubmitting: false }) }))

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
  toast.mockReset()
  mutate.mockClear()
})
afterEach(cleanup)

const mentions = () => screen.getByRole("switch", { name: "Mentions" })
const saveBar = () => screen.queryByRole("region", { name: "Unsaved changes" })

describe("unsaved email changes", () => {
  it("survive the Read receipts card updating the shared answer", () => {
    const { rerender } = render(<NotificationPreferencesCard />)
    fireEvent.click(mentions())
    expect(mentions()).toHaveAttribute("aria-checked", "false")
    expect(saveBar()).toBeInTheDocument()

    // Read receipts switched off elsewhere on the page: a new answer, the
    // person's own change untouched.
    state.fetch = answered({ read_receipts: false })
    rerender(<NotificationPreferencesCard />)

    expect(mentions()).toHaveAttribute("aria-checked", "false")
    expect(saveBar()).toBeInTheDocument()
  })

  it("show the server's newer value for a setting the person did not touch", () => {
    const { rerender } = render(<NotificationPreferencesCard />)
    fireEvent.click(mentions())
    state.fetch = answered({ email_calls: false })
    rerender(<NotificationPreferencesCard />)
    expect(screen.getByRole("switch", { name: "Calls" })).toHaveAttribute("aria-checked", "false")
  })

  it("go away when the person turns a switch back to how it was saved", () => {
    render(<NotificationPreferencesCard />)
    fireEvent.click(mentions())
    fireEvent.click(mentions())
    expect(saveBar()).toBeNull()
  })
})

describe("saving", () => {
  it("sends only what changed, quietly for the global toast, and says it saved", async () => {
    post.mockResolvedValue({ data: { status: "success" } })
    render(<NotificationPreferencesCard />)
    fireEvent.click(mentions())
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save" })))

    expect(post).toHaveBeenCalledTimes(1)
    const [, payload, config] = post.mock.calls[0]
    expect(payload).toEqual({ email_mentions: false })
    expect(config).toEqual({ suppressErrorToast: true })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Notification settings saved" }))
    expect(mutate).toHaveBeenCalled()
  })

  it("keeps the change and says why when the save fails", async () => {
    post.mockRejectedValue({ response: { status: 503, data: { msg: "The server is restarting." } } })
    render(<NotificationPreferencesCard />)
    fireEvent.click(mentions())
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save" })))

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't save your notification settings", description: "The server is restarting.", variant: "destructive" }),
      ),
    )
    expect(mentions()).toHaveAttribute("aria-checked", "false")
    expect(saveBar()).toBeInTheDocument()
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
    expect(screen.getByText("Couldn't load your notification settings")).toBeInTheDocument()
    expect(screen.queryByText(/hasn.t turned email on/)).toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(mutate).toHaveBeenCalled()
  })

  it("still says when email is genuinely off on this server", () => {
    state.fetch = answered({ email_supported: false })
    render(<NotificationPreferencesCard />)
    expect(screen.getByText(/hasn.t turned email on/)).toBeInTheDocument()
  })
})

// One rhythm on the page: every setting is a row of the list, at the switch
// rows' padding, with its name and help on the left and its control at the end.
// The digest and the quiet-hours times were hand-made blocks at their own
// spacing, and the digest's radios didn't answer the arrow keys.
describe("the page's rows", () => {
  it("makes the digest a choice of one that the arrow keys move through", async () => {
    render(<NotificationPreferencesCard />)
    const group = screen.getByRole("radiogroup", { name: "Activity digest" })
    const off = within(group).getByRole("radio", { name: "Off" })
    const daily = within(group).getByRole("radio", { name: "Daily" })
    act(() => off.focus())
    fireEvent.keyDown(off, { key: "ArrowRight" })
    await waitFor(() => expect(document.activeElement).toBe(daily))
    expect(daily).toHaveAttribute("aria-checked", "true")
    expect(group.closest(".divide-y")).not.toBeNull()
  })

  it("puts each quiet-hours time in its own row of the list", () => {
    state.fetch = answered({ quiet_hours_enabled: true, quiet_hours_start: "22:00", quiet_hours_end: "07:00", quiet_hours_tz: "Asia/Kolkata" })
    render(<NotificationPreferencesCard />)
    const from = screen.getByLabelText("From")
    const until = screen.getByLabelText("Until")
    const zone = screen.getByLabelText("Time zone")
    const rowOf = (el: HTMLElement) => el.closest(".px-4.py-3")
    expect(rowOf(from)).not.toBeNull()
    expect(new Set([rowOf(from), rowOf(until), rowOf(zone)]).size).toBe(3)
    expect(rowOf(from)?.parentElement?.className).toMatch(/divide-y/)
  })
})
