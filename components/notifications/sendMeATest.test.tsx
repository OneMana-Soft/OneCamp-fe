import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { clockWords, failureOf } from "@/lib/notifications/whyWords"

/*
 * Settings > Notifications' "Send me a test" (A4 H3): one POST /notify/test
 * through the card's own client, and its answer, or its refusal, in words.
 */

const post = vi.hoisted(() => vi.fn())
const net = vi.hoisted(() => ({ offline: false }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))
vi.mock("@/lib/connectivity", async (original) => ({ ...(await original<object>()), isAppOffline: () => net.offline }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }) }))

import { NotifyTestSection, SendMeATest } from "@/components/notifications/SendMeATest"

beforeEach(() => {
  post.mockReset()
  net.offline = false
})
afterEach(cleanup)

const ME = "11111111-1111-4111-8111-111111111111"
const answer = {
  user_id: ME,
  event_id: `test:${ME}:202611080631`,
  steps: [
    { step: "audience", verdict: "site", causes: ["notify.test"] },
    { step: "hold", verdict: "not_held" },
  ],
  decision: { user_id: ME, cause: "notify.test", to: ["push"] },
  devices: { push_devices: 1, push_known: true, apps_open: 1, apps_known: true },
  told: ["push"],
}

// A time keeps its "AM" on its line (lib/utils/date/clock's no-break space); the page's text is read with plain spaces.
const spaced = (words: string) => words.replace(/\s+/g, " ")
const send = () => fireEvent.click(screen.getByRole("button", { name: "Send me a test" }))

describe("Send me a test", () => {
  it("is Settings > Notifications' Test section, the place Search settings lands on", () => {
    render(<NotifyTestSection />)
    const button = screen.getByRole("button", { name: "Send me a test" })
    expect(button.id).toBe("notify_test")
    expect(button.closest("#notifications-test")).not.toBeNull()
    expect(button.getAttribute("aria-expanded")).toBe("false")
  })

  it("sends one test through the card's client, saying it itself, and shows the answer; Send again sends another", async () => {
    post.mockResolvedValue({ data: answer })
    render(<SendMeATest />)
    send()
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith("/notify/test", {}, expect.objectContaining({ suppressErrorToast: true }))
    const root = (await screen.findByRole("heading", { name: "Test sent" })).closest<HTMLElement>("[role=dialog]")!
    expect(within(root).getByText("Push is on for 1 device.")).toBeInTheDocument()
    fireEvent.click(within(root).getByRole("button", { name: "Send again" }))
    expect(post).toHaveBeenCalledTimes(2)
  })

  // A press on the open door is the door's: Radix's outside press is kept off it, so the press closes and sends nothing.
  it("pressing its open door closes the panel, gives the door the focus, and sends no second test", async () => {
    post.mockResolvedValue({ data: answer })
    render(<SendMeATest />)
    const door = screen.getByRole("button", { name: "Send me a test" })
    door.focus()
    send()
    await screen.findByRole("heading", { name: "Test sent" })
    await new Promise((r) => setTimeout(r, 0)) // Radix hears outside presses from the next tick
    fireEvent.pointerDown(door)
    fireEvent.click(door)
    expect(door.getAttribute("aria-expanded")).toBe("false")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(door)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("a 429 says when the next test can go, from the answer's retry time", async () => {
    const at = new Date(Date.now() + 40_000).toISOString()
    post.mockRejectedValue({ isAxiosError: true, response: { status: 429, data: { code: "too_soon", retry_at: at, msg: "One test a minute." }, headers: { "retry-after": "40" } } })
    render(<SendMeATest />)
    send()
    expect(await screen.findByText(spaced(`You can send the next one at ${clockWords(at)}.`))).toBeInTheDocument()
  })

  it("a 429 without a time in its body takes Retry-After's", async () => {
    post.mockRejectedValue({ isAxiosError: true, response: { status: 429, data: {}, headers: { "retry-after": "30" } } })
    render(<SendMeATest />)
    send()
    expect(await screen.findByRole("heading", { name: "One test a minute" })).toBeInTheDocument()
    expect(screen.getByText(/^You can send the next one at /)).toBeInTheDocument()
  })

  it("Retry-After sets the next test's time itself, not a minute's guess", () => {
    const now = Date.now()
    const tooSoon = { isAxiosError: true, response: { status: 429, data: {}, headers: { "retry-after": "300" } } }
    expect(failureOf(tooSoon, now)).toEqual({ status: "too_soon", retryAt: new Date(now + 300_000).toISOString() })
  })

  it("a 403 for the shared demo visitor says why there's no test", async () => {
    post.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { code: "demo", msg: "Not in the demo." } } })
    render(<SendMeATest />)
    send()
    expect(await screen.findByRole("heading", { name: "Not in the demo" })).toBeInTheDocument()
  })

  it("no answer says offline; a 503 says it couldn't send", async () => {
    net.offline = true
    post.mockRejectedValue({ isAxiosError: true, code: "ERR_NETWORK" })
    render(<SendMeATest />)
    send()
    expect(await screen.findByText("Connect, then try again.")).toBeInTheDocument()
    cleanup()
    net.offline = false
    post.mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { msg: "Couldn't send a test. Try again." } } })
    render(<SendMeATest />)
    send()
    expect(await screen.findByText("Couldn't send a test. Try again.")).toBeInTheDocument()
  })
})
