import { AxiosError } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Pages for people outside the workspace (a shared link, a booking page, an
// intake form, unsubscribing) have no session to refresh. Every page loads the
// API client (the root layout's theme sync reaches it), and with it the timer
// that refreshes a session near its end and signs the browser out when the
// refresh is refused. Four minutes into booking a meeting or filling in a
// form, the visitor was signed "out" and sent to the sign-in page, losing what
// they had typed. Only the guest pages were spared.

const { refreshSession } = vi.hoisted(() => ({ refreshSession: vi.fn() }))
vi.mock("@/lib/auth/sessionRefresh", () => ({
  refreshSession,
  // A session past its end, by the clock every tab shares.
  sessionIsStale: () => true,
  onSessionRefreshed: () => () => {},
}))
vi.mock("@/hooks/use-toast", () => ({ toast: () => ({ id: "1", dismiss: () => {}, update: () => {} }), useToast: () => ({ toast: () => {} }) }))
vi.mock("@/store/store", () => ({ default: { dispatch: () => {} } }))
vi.mock("@/lib/sessionEnd", () => ({ endSession: async () => {} }))

const { default: axiosInstance, onVisitorPage } = await import("@/lib/axiosInstance")

const VISITOR_PAGES = ["/guest/d/abc123", "/book/maya-patel", "/booking/tok-123", "/f/form-tok", "/rsvp/tok-456", "/unsubscribe"]

function becomeVisible() {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
  document.dispatchEvent(new Event("visibilitychange"))
}

let previousAdapter = axiosInstance.defaults.adapter
beforeEach(() => {
  refreshSession.mockReset()
  refreshSession.mockRejectedValue(new AxiosError("Unauthorized", "401", undefined, undefined, { status: 401 } as never))
  previousAdapter = axiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = async (config) => ({ data: { msg: "ok" }, status: 200, statusText: "OK", headers: {}, config })
})
afterEach(() => {
  axiosInstance.defaults.adapter = previousAdapter
  window.history.replaceState(null, "", "/")
})

describe("a page for someone outside the workspace", () => {
  it("is told from the app's pages", () => {
    for (const path of VISITOR_PAGES) expect(onVisitorPage(path), path).toBe(true)
    for (const path of ["/app/home", "/app/doc/abc123", "/", "/invoice/p1", "/bookings", "/form"]) expect(onVisitorPage(path), path).toBe(false)
  })

  it.each(VISITOR_PAGES)("%s: the refresh timer leaves its visitor alone", (path) => {
    window.history.replaceState(null, "", path)
    becomeVisible()
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it.each(VISITOR_PAGES)("%s: a request leaves without a refresh first", async (path) => {
    window.history.replaceState(null, "", path)
    await axiosInstance.get("/public/thing")
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it("still refreshes a member's session in the app", async () => {
    window.history.replaceState(null, "", "/app/home")
    refreshSession.mockResolvedValue(undefined)
    becomeVisible()
    expect(refreshSession).toHaveBeenCalledTimes(1)
    await axiosInstance.get("/user/profile")
    expect(refreshSession).toHaveBeenCalledTimes(2)
  })
})
