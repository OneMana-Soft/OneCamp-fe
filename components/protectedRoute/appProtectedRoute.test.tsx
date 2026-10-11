import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// What the profile request has come to, set by each test.
let profile: Record<string, unknown> = {}
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ ...profile, mutate }),
}))
const logout = vi.fn().mockResolvedValue({})
vi.mock("axios", () => ({ default: { post: (...args: unknown[]) => logout(...args) } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/store/store", () => ({ default: { dispatch: vi.fn() }, persistor: { purge: vi.fn() }, RESET_STORE_ACTION: "reset" }))
vi.mock("@/lib/pendingConnect", () => ({ takePendingConnect: () => null }))

import { AppProtectedRoute, sessionGone } from "@/components/protectedRoute/appProtectedRoute"
import { SESSION_ENDED_KEY, onSessionEnd } from "@/lib/sessionEnd"

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })
const page = () => render(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)

beforeEach(() => {
  logout.mockClear()
  mutate.mockClear()
})
afterEach(cleanup)

describe("signing out from a protected page", () => {
  it("happens when the server says the session is gone", async () => {
    for (const status of [401, 403]) {
      logout.mockClear()
      profile = { isLoading: false, isValidating: false, isError: httpError(status), data: undefined }
      page()
      await act(async () => {})
      expect(logout, String(status)).toHaveBeenCalledTimes(1)
      cleanup()
    }
  })

  it("happens when the server answers without a user", async () => {
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { msg: "ok" } }
    page()
    await act(async () => {})
    expect(logout).toHaveBeenCalledTimes(1)
  })

  // THE DEMO BUG. Any failure signed people out, so a network blip or a
  // server error sent everyone back to the login page.
  it("doesn't happen on a network blip, a server error or an unreadable reply: it offers to try again", async () => {
    for (const error of [new Error("Network Error"), httpError(500), httpError(502), new Error("ZodError")]) {
      profile = { isLoading: false, isValidating: false, isError: error, data: undefined }
      page()
      await act(async () => {})
      expect(logout, error.message).not.toHaveBeenCalled()
      screen.getByRole("button", { name: /try again/i }).click()
      expect(mutate).toHaveBeenCalled()
      cleanup()
      mutate.mockClear()
    }
  })

  it("asks for the profile when nothing has asked yet, rather than signing out", async () => {
    profile = { isLoading: false, isValidating: false, isError: undefined, data: undefined }
    page()
    await act(async () => {})
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(logout).not.toHaveBeenCalled()
  })

  it("shows the app once there's a user", async () => {
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "u", user_name: "Sam" } } }
    page()
    await act(async () => {})
    expect(screen.getByText("the app")).toBeTruthy()
    expect(logout).not.toHaveBeenCalled()
  })
})

describe("a session that ends", () => {
  const realLocation = window.location
  const replace = vi.fn()
  beforeEach(() => {
    replace.mockClear()
    Object.defineProperty(window, "location", { value: { ...realLocation, replace, href: realLocation.href }, writable: true })
  })
  afterEach(() => {
    Object.defineProperty(window, "location", { value: realLocation, writable: true })
    localStorage.clear()
  })

  it("lets go of the member's things and tells the other tabs before storage is cleared", async () => {
    localStorage.setItem("onecamp-app-cache", "the member's responses")
    let storedWhenForgotten: string | null = null
    const off = onSessionEnd(() => {
      storedWhenForgotten = localStorage.getItem("onecamp-app-cache")
    })
    profile = { isLoading: false, isValidating: false, isError: httpError(401), data: undefined }
    page()
    await act(async () => {})
    await act(async () => {})
    expect(storedWhenForgotten).toBe("the member's responses")
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
    off()
  })

  it("in another tab sends this one to the login page", async () => {
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "u", user_name: "Sam" } } }
    page()
    await act(async () => {})
    window.dispatchEvent(new StorageEvent("storage", { key: SESSION_ENDED_KEY, newValue: "1" }))
    await act(async () => {})
    expect(replace).toHaveBeenCalledWith("/")
  })

  it("in another tab sends nothing anywhere once the app has gone", async () => {
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "u", user_name: "Sam" } } }
    page()
    await act(async () => {})
    cleanup()
    window.dispatchEvent(new StorageEvent("storage", { key: SESSION_ENDED_KEY, newValue: "1" }))
    await act(async () => {})
    expect(replace).not.toHaveBeenCalled()
  })
})

describe("whether a failure means the session is gone", () => {
  it("is only a 401 or a 403", () => {
    expect(sessionGone(httpError(401))).toBe(true)
    expect(sessionGone(httpError(403))).toBe(true)
    expect(sessionGone(httpError(500))).toBe(false)
    expect(sessionGone(new Error("Network Error"))).toBe(false)
    expect(sessionGone(undefined)).toBe(false)
  })
})

// Design v3 (shell §L1): the app opens on a splash, never a centred spinner.
describe("the splash while the profile loads", () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  it("draws the ring and names the workspace, with no spinner anywhere", async () => {
    profile = { isLoading: true, isValidating: true, isError: undefined, data: undefined }
    const view = page()
    await act(async () => {})
    expect(screen.getByRole("status").textContent).toMatch(/^Opening /)
    expect(view.container.querySelector("[data-splash-ring] .splash-ring-draw")).toBeTruthy()
    expect(view.container.querySelector(".animate-spin, svg.lucide-loader-circle, svg.lucide-loader")).toBeNull()
    expect(view.container.querySelector(".app-frame.splash")).toBeTruthy()
  })

  it("says it is still connecting after 8 seconds, and Try again asks again", async () => {
    vi.useFakeTimers()
    profile = { isLoading: true, isValidating: true, isError: undefined, data: undefined }
    page()
    await act(async () => void vi.advanceTimersByTime(8100))
    expect(screen.getByText(/Still connecting to/)).toBeTruthy()
    screen.getByRole("button", { name: "Try again" }).click()
    expect(mutate).toHaveBeenCalled()
  })

  it("shows the skeleton shell instead in a tab that has opened the app before", async () => {
    sessionStorage.setItem("onecamp:opened", "1")
    profile = { isLoading: true, isValidating: true, isError: undefined, data: undefined }
    const view = page()
    await act(async () => {})
    expect(view.container.querySelector("[data-skeleton-shell]")).toBeTruthy()
    expect(view.container.querySelector("[data-splash-ring]")).toBeNull()
  })

  it("puts an error on the same frame, with the crash spot", async () => {
    profile = { isLoading: false, isValidating: false, isError: new Error("Network Error"), data: undefined }
    const view = page()
    await act(async () => {})
    expect(view.container.querySelector("[data-splash-error] [data-spot-crash]")).toBeTruthy()
  })

  it("fades the shell in after the splash", async () => {
    profile = { isLoading: true, isValidating: true, isError: undefined, data: undefined }
    const view = page()
    await act(async () => {})
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "u", user_name: "Sam" } } }
    view.rerender(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    await act(async () => {})
    expect(screen.getByText("the app").parentElement?.className).toBe("shell-enter")
  })
})
