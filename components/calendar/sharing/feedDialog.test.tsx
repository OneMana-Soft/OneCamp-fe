import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const put = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put, delete: del } }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
// What the reads answer, one object each per test as SWR keeps them.
const answers = vi.hoisted(() => ({
  calendars: { data: { data: [{ id: "cal-me", kind: "personal", name: "Personal", access: "manage", mine: true }] } },
  feed: { data: undefined as unknown, isError: undefined as unknown },
  mutate: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url === "/calendar/calendars"
      ? answers.calendars
      : url.endsWith("/feed")
        ? { data: answers.feed.data, isError: answers.feed.isError, mutate: answers.mutate }
        : { data: undefined, mutate: answers.mutate },
}))

import FeedDialog from "./feedDialog"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

afterEach(() => {
  cleanup()
  put.mockReset()
  del.mockReset()
  answers.mutate.mockReset()
  confirm.mockReset()
})

const feed = (f: Record<string, unknown>) => {
  answers.feed = { data: { data: f }, isError: undefined }
}

// Calendar B8: a calendar in another app through a secret link of your own.
describe("showing a calendar in another app", () => {
  it("makes a link showing everything, gives it once, and Done closes", async () => {
    feed({ live: false, most: "full" })
    put.mockResolvedValue({ data: { data: { live: true, url: "https://api.test/public/calendar/s3cret.ics", scope: "full", most: "full", created_at: "2026-10-20T10:00:00Z" } } })
    const closed = vi.fn()
    render(<FeedDialog onClose={closed} />)
    expect(screen.getByRole("heading", { name: "Show your calendar in another app" })).toBeTruthy()
    expect(screen.getByText("No link yet.")).toBeTruthy()
    // DESIGN-BUILD-3, 20 Oct 2026: a link gets forwarded, so out of the box
    // it shows the least (as Outlook's publishing does); everything is a choice.
    expect(screen.getByRole("radio", { name: "When it's busy" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("radio", { name: "Everything" }))
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    await waitFor(() => expect(put).toHaveBeenCalledWith("/calendar/calendars/cal-me/feed", { scope: "full" }, OWN_ERRORS))
    const link = (await screen.findByRole("textbox", { name: "The calendar's link" })) as HTMLInputElement
    expect(link.value).toBe("https://api.test/public/calendar/s3cret.ics")
    // DESIGN-BUILD-8 (F1 SF): it ends in a fade over its last 24 px, not a cut
    // glyph, on a ground the fade leaves whole; focused, it is selected and whole.
    expect(link.className).toMatch(/\[mask-image:linear-gradient\(to_right,#000_calc\(100%-24px\),transparent\)\]/)
    expect(link.className).toMatch(/focus:\[mask-image:none\]/)
    expect(link.className).not.toMatch(/\bbg-sunken\b/)
    expect(link.closest("[data-feed-field]")?.className).toMatch(/\bbg-sunken\b/)
    expect(link.readOnly).toBe(true)
    link.setSelectionRange(0, 0)
    fireEvent.focus(link)
    expect([link.selectionStart, link.selectionEnd]).toEqual([0, link.value.length])
    expect(screen.getByText(/only time it's shown/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(closed).toHaveBeenCalled()
  })

  it("says a link it has without showing it again, makes a new one, and stops it", async () => {
    feed({ live: true, scope: "busy", most: "full", created_at: "2026-10-18T10:00:00Z" })
    put.mockResolvedValue({ data: { data: { live: true, url: "https://api.test/public/calendar/n3w.ics", scope: "busy", most: "full" } } })
    del.mockResolvedValue({})
    render(<FeedDialog onClose={() => {}} />)
    expect(screen.getByText(/You have a link .*showing when it's busy/)).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "The calendar's link" })).toBeNull()
    // AUDIT-WEB-2 F1: a new link stops the live one for every app reading it, so it asks first.
    fireEvent.click(screen.getByRole("button", { name: "Make a new link" }))
    expect(put).not.toHaveBeenCalled()
    const asked = confirm.mock.calls[0]?.[0] as { description: string; destructive: boolean; onConfirm: () => unknown }
    expect(asked.destructive).toBe(true)
    expect(asked.description).toMatch(/stops at once/)
    await asked.onConfirm()
    expect(put).toHaveBeenCalledWith("/calendar/calendars/cal-me/feed", { scope: "busy" }, OWN_ERRORS)
    expect(((await screen.findByRole("textbox", { name: "The calendar's link" })) as HTMLInputElement).value).toBe("https://api.test/public/calendar/n3w.ics")
    cleanup()
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Stop the link" }))
    await waitFor(() => expect(del).toHaveBeenCalledWith("/calendar/calendars/cal-me/feed", OWN_ERRORS))
    expect(await screen.findByText("No link yet.")).toBeTruthy()
  })

  it("shows only when for a calendar its person sees only as busy", async () => {
    feed({ live: false, most: "busy" })
    put.mockResolvedValue({ data: { data: { live: true, url: "https://api.test/public/calendar/b.ics", scope: "busy", most: "busy" } } })
    render(<FeedDialog calendar={{ id: "cal-jonas", name: "Jonas" }} onClose={() => {}} />)
    expect(screen.getByRole("heading", { name: "Show “Jonas” in another app" })).toBeTruthy()
    expect(screen.getByText("You see only when they're busy, so the link can show only that.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    await waitFor(() => expect(put).toHaveBeenCalledWith("/calendar/calendars/cal-jonas/feed", { scope: "busy" }, OWN_ERRORS))
  })

  it("makes nothing while the link is read, and says so with Try again when the read fails", async () => {
    answers.feed = { data: undefined, isError: undefined }
    render(<FeedDialog onClose={() => {}} />)
    expect((screen.getByRole("button", { name: /Make a/ }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    answers.feed = { data: undefined, isError: new Error("offline") }
    render(<FeedDialog onClose={() => {}} />)
    expect(screen.getByText("Couldn't load the calendar's link")).toBeTruthy()
    expect((screen.getByRole("button", { name: /Make a/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(answers.mutate).toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  it("says why when the workspace has turned links off", async () => {
    feed({ live: false, most: "full" })
    put.mockRejectedValue({ response: { status: 400, data: { msg: "Your workspace has turned off links to calendars." } } })
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(/turned off links|couldn't be made/)
  })
})
