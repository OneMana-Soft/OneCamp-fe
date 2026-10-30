import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const post = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))

import SubscribeDialog from "./subscribeDialog"
import { HOLIDAY_CALENDARS } from "@/lib/calendar/subscriptions"

afterEach(() => {
  cleanup()
  post.mockReset()
})

const added = { calendar_id: "cal-hol", name: "Holidays in India", host: "calendar.google.com", reading: true, events: 120 }

// Calendar B8: a calendar added by its address, public holidays first.
describe("adding a calendar", () => {
  it("adds a country's public holidays in one press, India first", async () => {
    post.mockResolvedValue({ data: { data: added } })
    const onAdded = vi.fn()
    render(<SubscribeDialog onAdded={onAdded} onClose={() => {}} />)
    expect(screen.getByRole("heading", { name: "Add a calendar" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Public holidays" }).getAttribute("aria-checked")).toBe("true")
    expect(document.querySelector("[data-holiday-country]")?.textContent).toContain("India")
    fireEvent.click(screen.getByRole("button", { name: "Add calendar" }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(added))
    expect(post).toHaveBeenCalledWith("/calendar/subscriptions", { address: HOLIDAY_CALENDARS[0].address, name: "", hue: "" }, OWN_ERRORS)
  })

  it("takes an address and a name, asks for an address it can read, and says why the server couldn't", async () => {
    post.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { msg: "There's no calendar at that address. Check it, or copy it again from where it's published." } } })
    const onAdded = vi.fn()
    render(<SubscribeDialog onAdded={onAdded} onClose={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: "By its address" }))
    const address = screen.getByRole("textbox", { name: "Address" })
    fireEvent.change(address, { target: { value: "calendar.example/team.ics" } })
    fireEvent.click(screen.getByRole("button", { name: "Add calendar" }))
    expect(await screen.findByText("Paste an address that starts with https://, http:// or webcal://.")).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
    fireEvent.change(address, { target: { value: "webcal://calendar.example/team.ics" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Team" } })
    fireEvent.click(screen.getByRole("button", { name: "Add calendar" }))
    // On the Address field, where its help was, and the field marked invalid (DESIGN-BUILD-3).
    expect(await screen.findByText("There's no calendar at that address. Check it, or copy it again from where it's published.")).toBeTruthy()
    expect(address.getAttribute("aria-invalid")).toBe("true")
    expect(screen.queryByText(/OneCamp keeps it encrypted/)).toBeNull()
    expect(post).toHaveBeenCalledWith("/calendar/subscriptions", { address: "webcal://calendar.example/team.ics", name: "Team", hue: "" }, OWN_ERRORS)
    expect(onAdded).not.toHaveBeenCalled()
  })
})
