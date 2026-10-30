import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const put = vi.hoisted(() => vi.fn())
const makeRequest = vi.hoisted(() => vi.fn())
const toasts = vi.hoisted(() => [] as { title?: unknown; variant?: unknown }[])
// What the reads answer, one object each per test as SWR keeps them (a new
// object on every render would be a new answer every time).
const shares = vi.hoisted(() => ({ answer: { data: { data: [] as unknown[] } }, mutate: vi.fn() }))
const setShares = (list: unknown[]) => {
  shares.answer = { data: { data: list } }
}
const calendars = vi.hoisted(() => ({
  data: { data: [{ id: "cal-me", kind: "personal", name: "Personal", access: "manage" }, { id: "cal-fam", kind: "external", name: "Family", access: "manage" }] },
}))
const self = vi.hoisted(() => ({ data: { data: { user_uuid: "u-sam", user_name: "Sam Rivera" } } }))
const none = vi.hoisted(() => ({ data: undefined }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put } }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: unknown }) => toasts.push(t) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url === "/calendar/calendars"
      ? calendars
      : url === "/calendar/calendars/cal-me/shares"
        ? { data: shares.answer.data, mutate: shares.mutate }
        : { ...none, mutate: shares.mutate },
  useFetchOnlyOnce: () => self,
}))

import ShareCalendarDialog from "./shareCalendarDialog"

afterEach(() => {
  cleanup()
  put.mockReset()
  makeRequest.mockReset()
  shares.mutate.mockReset()
  toasts.length = 0
})

/** Opens a Radix menu in jsdom, as the menu tests do. */
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

const roles = () => [...document.querySelectorAll("[data-share-role]")].map((r) => r.textContent)

// Calendar A6 (SC-25): your calendar shared, each person at a level.
describe("sharing your calendar", () => {
  it("lists you and who it's shared with, changes a level and stops sharing, each through the calendar's API", async () => {
    setShares([{ person: { user_uuid: "u-ria", user_name: "Ria" }, level: "details" }])
    put.mockResolvedValue({})
    render(<ShareCalendarDialog onClose={() => {}} />)
    expect(screen.getByRole("heading", { name: "Share your calendar" })).toBeTruthy()
    await waitFor(() => expect(roles()).toEqual(["Owner", "Can see details"]))

    openMenu(screen.getByRole("button", { name: "Ria: Can see details" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: /Can edit$/ }))
    expect(put).toHaveBeenCalledWith("/calendar/calendars/cal-me/shares/u-ria", { level: "edit" }, OWN_ERRORS)
    await waitFor(() => expect(roles()).toEqual(["Owner", "Can edit"]))

    openMenu(screen.getByRole("button", { name: "Ria: Can edit" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove access" }))
    expect(put).toHaveBeenLastCalledWith("/calendar/calendars/cal-me/shares/u-ria", { level: "" }, OWN_ERRORS)
    await waitFor(() => expect(roles()).toEqual(["Owner"]))
    expect(screen.getByText("Not shared with anyone yet.")).toBeTruthy()
  })

  it("adds a teammate found by name at the level chosen, and says so", async () => {
    setShares([])
    put.mockResolvedValue({})
    makeRequest.mockResolvedValue([{ user_uuid: "u-jo", user_name: "Jonas Weber" }, { channel_uuid: "ch-1", channel_name: "design" }])
    render(<ShareCalendarDialog onClose={() => {}} />)
    vi.useFakeTimers()
    fireEvent.change(screen.getByRole("combobox", { name: "Add people" }), { target: { value: "jo" } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    vi.useRealTimers()
    expect(makeRequest.mock.calls[0][0].payload).toEqual({ search_text: "jo" })
    // Members only: a channel the search found isn't offered.
    expect(screen.getAllByRole("option")).toHaveLength(1)
    fireEvent.click(screen.getByRole("option", { name: /Jonas Weber/ }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Invite" })))
    expect(put).toHaveBeenCalledWith("/calendar/calendars/cal-me/shares/u-jo", { level: "details" }, OWN_ERRORS)
    await waitFor(() => expect(roles()).toEqual(["Owner", "Can see details"]))
    expect(toasts[0].title).toBe("Jonas Weber can see your calendar now")
    expect(shares.mutate).toHaveBeenCalled()
  })

  it("puts a change back, and says so, when the server refuses it", async () => {
    setShares([{ person: { user_uuid: "u-ria", user_name: "Ria" }, level: "edit" }])
    put.mockRejectedValue({ response: { status: 404, data: { msg: "That calendar isn't yours to share." } } })
    render(<ShareCalendarDialog onClose={() => {}} />)
    await waitFor(() => expect(roles()).toEqual(["Owner", "Can edit"]))
    openMenu(screen.getByRole("button", { name: "Ria: Can edit" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: /Can edit and share/ }))
    await waitFor(() => expect(toasts[0]?.variant).toBe("destructive"))
    expect(toasts[0].title).toBe("Couldn't change what they see")
    expect(roles()).toEqual(["Owner", "Can edit"])
  })

  it("shares another calendar you manage by its name, without you as its owner", async () => {
    render(<ShareCalendarDialog calendar={{ id: "cal-fam", name: "Family" }} onClose={() => {}} />)
    expect(screen.getByRole("heading", { name: "Share “Family”" })).toBeTruthy()
    expect(roles()).toEqual([])
  })

  it("has no link to copy, and Done is the dialog's only way out in its footer", () => {
    setShares([])
    const closed = vi.fn()
    render(<ShareCalendarDialog onClose={closed} />)
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(closed).toHaveBeenCalled()
  })
})
