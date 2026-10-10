import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Google Calendar, in the profile. A status that couldn't be read is not "Not
// connected": that offered a Connect button which started a second sign-in for
// a calendar already linked. And connecting, disconnecting or changing the
// due-date setting says when it fails; each failure used to reach only the
// console.

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get, post }, OWN_ERRORS: { suppressErrorToast: true } }))
// The confirm is answered yes at once.
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => (o: { onConfirm: () => void }) => o.onConfirm() }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }))
vi.mock("@/components/activeTheme/ColorThemePicker", () => ({ ColorThemePicker: () => null }))
vi.mock("@/components/profile/ChangePasswordSection", () => ({ ChangePasswordSection: () => null }))
vi.mock("@/components/profile/TwoFactorSection", () => ({ TwoFactorSection: () => null }))
vi.mock("@/components/profile/PasskeySection", () => ({ PasskeySection: () => null }))

const { CalendarSection } = await import("@/components/profile/ProfileSettingsSections")

const connected = { data: { data: { isConnected: true, taskSyncEnabled: false } } }

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})
afterEach(cleanup)

describe("the Google Calendar row", () => {
  it("says the status couldn't be checked, without offering to connect, and tries again", async () => {
    get.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce(connected)
    render(<CalendarSection />)
    expect(await screen.findByText("Couldn't check your Google Calendar connection")).toBeInTheDocument()
    expect(screen.queryByText("Not connected")).toBeNull()
    expect(screen.queryByRole("button", { name: /^connect/i })).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /try again/i })))
    expect(await screen.findByText("Connected")).toBeInTheDocument()
  })

  it("holds its place while the status loads", () => {
    get.mockReturnValue(new Promise(() => {}))
    render(<CalendarSection />)
    expect(screen.getByRole("status", { name: "Checking your Google Calendar connection" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /connect/i })).toBeNull()
  })

  it("names its button for what it does", async () => {
    get.mockResolvedValue(connected)
    render(<CalendarSection />)
    expect(await screen.findByRole("button", { name: "Disconnect Google Calendar" })).toBeInTheDocument()
  })

  it("says why connecting didn't start", async () => {
    get.mockResolvedValueOnce({ data: { data: { isConnected: false, taskSyncEnabled: false } } })
    get.mockRejectedValueOnce({ response: { status: 503, data: { msg: "Google sign-in isn't set up on this server." } } })
    render(<CalendarSection />)
    const connect = await screen.findByRole("button", { name: "Connect Google Calendar" })
    await act(async () => void fireEvent.click(connect))
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start connecting Google Calendar. Google sign-in isn't set up on this server.")
  })

  it("says why disconnecting failed, and stays connected", async () => {
    get.mockResolvedValue(connected)
    post.mockRejectedValue(new Error("Network Error"))
    render(<CalendarSection />)
    const disconnect = await screen.findByRole("button", { name: "Disconnect Google Calendar" })
    await act(async () => void fireEvent.click(disconnect))
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Couldn't disconnect Google Calendar\. The server could not be reached/)
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  it("says why the due-date setting didn't change, and leaves it as it was", async () => {
    get.mockResolvedValue(connected)
    post.mockRejectedValue({ response: { status: 500, data: { msg: "Calendar sync is paused." } } })
    render(<CalendarSection />)
    const sw = await screen.findByRole("switch", { name: "Put task due dates on my calendar" })
    await act(async () => void fireEvent.click(sw))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Calendar sync is paused."))
    expect(screen.getByRole("switch", { name: "Put task due dates on my calendar" })).toHaveAttribute("aria-checked", "false")
  })
})
