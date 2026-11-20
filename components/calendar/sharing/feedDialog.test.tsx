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
  // A read of its own for one link's address (basecamp-05: the workspace's beside your calendar's).
  byUrl: {} as Record<string, unknown>,
  mutate: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url === "/calendar/calendars"
      ? answers.calendars
      : url.endsWith("/feed")
        ? { data: answers.byUrl[url] ?? answers.feed.data, isError: answers.feed.isError, mutate: answers.mutate }
        : { data: undefined, mutate: answers.mutate },
}))

import FeedDialog from "./feedDialog"
/** The server's words when the workspace has turned links off (business/Calendar/feeds.go, business/Cycle/feed.go). */
const LINKS_OFF = "Your workspace has turned off links to calendars."
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

afterEach(() => {
  cleanup()
  put.mockReset()
  del.mockReset()
  answers.mutate.mockReset()
  confirm.mockReset()
  answers.byUrl = {}
  answers.calendars = { data: { data: [{ id: "cal-me", kind: "personal", name: "Personal", access: "manage", mine: true }] } }
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
    // A secret, not a page to pass on (CR-326 F5): it says so beside the field, and
    // Copy carries a key, never the share chain.
    expect(screen.getByText("Keep it to yourself.")).toBeTruthy()
    const copy = screen.getByRole("button", { name: "Copy" })
    expect(copy.querySelector("svg.lucide-key")).toBeTruthy()
    expect(copy.querySelector("svg.lucide-link")).toBeNull()
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

  // basecamp-05: an admin turned every link off (calendar.feeds.allowed). Every read of a link says so
  // (links_allowed), so the dialog offers nothing to make or copy before anything is pressed.
  it("with links off for the workspace, says so plainly before anything is pressed, and offers no link to make or copy, nor the link to everything", () => {
    feed({ live: true, scope: "full", most: "full", created_at: "2026-10-18T09:00:00Z", links_allowed: false })
    render(<FeedDialog onClose={() => {}} />)
    expect(screen.getByText(/Links to other apps are off for this workspace/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Make a/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "Everything you can see" })).toBeNull()
    expect(screen.queryByRole("radio", { name: "When it's busy" })).toBeNull()
    expect(screen.queryByText(/You have a link/)).toBeNull()
    // The live one can still be stopped, and Done closes.
    expect(screen.getByRole("button", { name: "Stop the link" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy()
    expect(put).not.toHaveBeenCalled()
  })

  it("says so for any calendar it shows, not only your own", () => {
    feed({ live: false, most: "busy", links_allowed: false })
    render(<FeedDialog calendar={{ id: "cal-jonas", name: "Jonas" }} onClose={() => {}} />)
    expect(screen.getByText(/Links to other apps are off for this workspace/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Make a/ })).toBeNull()
  })

  it("with links allowed, offers the link as ever", () => {
    feed({ live: false, most: "full", links_allowed: true })
    render(<FeedDialog onClose={() => {}} />)
    expect(screen.queryByText(/off for this workspace/)).toBeNull()
    expect(screen.getByText("No link yet.")).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Everything you can see" })).toBeTruthy()
    expect((screen.getByRole("button", { name: "Make a link" }) as HTMLButtonElement).disabled).toBe(false)
  })

  // An admin may turn links off while the dialog is open: the make is refused (400), and the link's read,
  // read again, says so. Only the read says links are off: never the refusal's words.
  it("when links are turned off while it is open, a refused link reads the link again and says so, whatever the refusal's words", async () => {
    feed({ live: false, most: "full", links_allowed: true })
    put.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { msg: "Bad request" } } })
    answers.mutate.mockImplementation(async () => {
      feed({ live: false, most: "full", links_allowed: false })
      return { data: { live: false, most: "full", links_allowed: false } }
    })
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    expect(await screen.findByText(/Links to other apps are off for this workspace/)).toBeTruthy()
    expect(answers.mutate).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: /Make a/ })).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("never takes a refusal's words for links being off: the read still allowing them, it shows the words and Make a link", async () => {
    feed({ live: false, most: "full", links_allowed: true })
    put.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { msg: LINKS_OFF } } })
    answers.mutate.mockResolvedValue({ data: { live: false, most: "full", links_allowed: true } })
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    expect((await screen.findByRole("alert")).textContent).toBe(LINKS_OFF)
    expect(screen.getByRole("button", { name: "Make a link" })).toBeTruthy()
    expect(screen.queryByText(/off for this workspace/)).toBeNull()
  })

  it("tells a refused choice apart from links being off", async () => {
    feed({ live: false, most: "full", links_allowed: true })
    put.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { msg: "Choose when you're busy, or everything." } } })
    answers.mutate.mockResolvedValue({ data: { live: false, most: "full", links_allowed: true } })
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Make a link" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Choose when you're busy, or everything.")
    expect(screen.getByRole("button", { name: "Make a link" })).toBeTruthy()
    expect(screen.queryByText(/off for this workspace/)).toBeNull()
  })
})

// basecamp-05: one link to everything you can see, beside your calendar's; and
// a link a workspace admin stopped says who stopped it and when.
describe("a link to everything you can see", () => {
  const WORKSPACE = "/calendar/calendars/workspace/feed"

  it("makes, copies once and stops the link to everything through the same dialog as your calendar's", async () => {
    feed({ live: false, most: "full" })
    answers.byUrl[WORKSPACE] = { data: { live: true, scope: "busy", created_at: "2026-10-02T09:00:00Z", most: "full" } }
    render(<FeedDialog onClose={() => {}} />)
    // Your calendar's link first, as before.
    expect(screen.getByText("No link yet.")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Everything you can see" }))
    expect(screen.getByRole("heading", { name: "Show everything you can see in another app" })).toBeTruthy()
    expect(screen.getByText(/You have a link from 2 Oct, showing when it's busy/)).toBeTruthy()
    put.mockResolvedValue({ data: { data: { live: true, url: "https://api.example/public/calendar/t.ics", scope: "full", most: "full" } } })
    fireEvent.click(screen.getByRole("radio", { name: "Everything" }))
    fireEvent.click(screen.getByRole("button", { name: "Make a new link" }))
    // A new link stops the one apps read now, so it asks first: the same confirm as your calendar's.
    expect(put).not.toHaveBeenCalled()
    await (confirm.mock.lastCall?.[0] as { onConfirm: () => Promise<void> }).onConfirm()
    expect(put).toHaveBeenCalledWith(WORKSPACE, { scope: "full" }, OWN_ERRORS)
    expect(((await screen.findByRole("textbox", { name: "The link to everything you can see" })) as HTMLInputElement).value).toBe("https://api.example/public/calendar/t.ics")
  })

  it("stops the link to everything", async () => {
    answers.byUrl[WORKSPACE] = { data: { live: true, scope: "full", most: "full" } }
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: "Everything you can see" }))
    del.mockResolvedValue({})
    fireEvent.click(screen.getByRole("button", { name: "Stop the link" }))
    await waitFor(() => expect(del).toHaveBeenCalledWith(WORKSPACE, OWN_ERRORS))
    expect(await screen.findByText("No link yet.")).toBeTruthy()
  })

  it("offers only when it's busy when that's the most it may show", () => {
    answers.byUrl[WORKSPACE] = { data: { live: false, most: "busy" } }
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: "Everything you can see" }))
    expect((screen.getByRole("radio", { name: "Everything" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("isn't offered to a session with no calendar of its own (a guest's or a bot's), nor beside a calendar named", () => {
    answers.calendars = { data: { data: [] } }
    render(<FeedDialog onClose={() => {}} />)
    expect(screen.queryByRole("radio", { name: "Everything you can see" })).toBeNull()
    cleanup()
    answers.calendars = { data: { data: [{ id: "cal-me", kind: "personal", name: "Personal", access: "manage", mine: true }] } }
    render(<FeedDialog calendar={{ id: "cal-jonas", name: "Jonas" }} onClose={() => {}} />)
    expect(screen.queryByRole("radio", { name: "Everything you can see" })).toBeNull()
  })

  it("says so for the link to everything, before anything is pressed", () => {
    answers.byUrl[WORKSPACE] = { data: { live: false, most: "full", links_allowed: false } }
    render(<FeedDialog onClose={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: "Everything you can see" }))
    expect(screen.getByText(/Links to other apps are off for this workspace/)).toBeTruthy()
    expect(screen.queryByRole("radio", { name: "Your calendar" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Make a link" })).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(put).not.toHaveBeenCalled()
  })

  it("says who stopped a link and when, with a way to make a new one", () => {
    feed({
      live: false,
      most: "full",
      stopped_by: { user_uuid: "u-asha", user_name: "Asha Rao", user_full_name: "Asha Rao", user_profile_object_key: "" },
      stopped_at: "2026-10-12T10:00:00Z",
    })
    render(<FeedDialog calendar={{ id: "cal-jonas", name: "Jonas" }} onClose={() => {}} />)
    expect(screen.getByText("Asha Rao stopped this link on 12 Oct.", { exact: false })).toBeTruthy()
    expect(screen.queryByText("No link yet.")).toBeNull()
    expect(screen.getByRole("button", { name: "Make a link" })).toBeTruthy()
  })
})
