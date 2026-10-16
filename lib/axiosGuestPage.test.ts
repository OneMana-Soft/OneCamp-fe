import axios from "axios"
import { afterEach, describe, expect, it, vi } from "vitest"

// A guest reading a shared doc has no session, so any request made for them
// answers 401. The app's answer to a 401 is to refresh the session and, when
// that fails, sign the browser out and go to the sign-in page: on a guest page
// that took the guest off the doc they were reading (a mention chip asked who
// "you" are; four minutes in, the refresh timer did). On a guest page a 401
// is just a refusal.

vi.mock("@/hooks/use-toast", () => ({ toast: () => ({ id: "1", dismiss: () => {}, update: () => {} }), useToast: () => ({ toast: () => {} }) }))

const { default: axiosInstance, onGuestPage } = await import("@/lib/axiosInstance")

function answer401() {
  const previous = axiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = async (config) => {
    const { AxiosError } = await import("axios")
    const res = { data: {}, status: 401, statusText: "401", headers: {}, config }
    throw new AxiosError("Unauthorized", "401", config, undefined, res as never)
  }
  return () => {
    axiosInstance.defaults.adapter = previous
  }
}

let restore = () => {}
afterEach(() => {
  restore()
  vi.restoreAllMocks()
  window.history.replaceState(null, "", "/")
})

describe("a 401 on a guest page", () => {
  it("knows a guest page from the app's", () => {
    expect(onGuestPage("/guest/d/abc123")).toBe(true)
    expect(onGuestPage("/guest/t/xyz")).toBe(true)
    expect(onGuestPage("/app/doc/abc123")).toBe(false)
    expect(onGuestPage("/")).toBe(false)
  })

  it("neither refreshes a session nor signs the guest out", async () => {
    window.history.replaceState(null, "", "/guest/d/abc123")
    const refresh = vi.spyOn(axios, "get")
    const logout = vi.spyOn(axios, "post")
    restore = answer401()
    await expect(axiosInstance.get("/user/profile")).rejects.toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe("/guest/d/abc123")
  })

  it("still refreshes a member's session in the app", async () => {
    window.history.replaceState(null, "", "/app/doc/abc123")
    const refresh = vi.spyOn(axios, "get").mockRejectedValue(new Error("offline"))
    restore = answer401()
    await expect(axiosInstance.get("/user/profile")).rejects.toBeTruthy()
    expect(refresh).toHaveBeenCalledWith(expect.stringMatching(/refreshToken$/), expect.anything())
  })
})
