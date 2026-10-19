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

import { AppProtectedRoute, sessionGone } from "@/components/protectedRoute/appProtectedRoute"
import { SESSION_ENDED_KEY, onSessionEnd } from "@/lib/sessionEnd"
import { APP_BOOT_LEAVE_MS, APP_BOOT_RETRY_ATTR, APP_BOOT_SCREEN_ATTR, MEMBER_KEY, appBootState, endAppBoot } from "@/lib/appBoot"

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
// 17 Oct 2026: one splash from the first paint to the app. The layout's
// splash (lib/appBoot) is held while the profile loads, put up if the app was
// opened from the sign-in page, and cross-fades into the app; where the
// layout has none, the app draws the same scene itself.
describe("the splash while the profile loads", () => {
  const loading = { isLoading: true, isValidating: true, isError: undefined, data: undefined }
  const ready = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "u", user_name: "Sam" } } }
  let boot: HTMLElement
  beforeEach(() => {
    sessionStorage.clear()
    boot = document.createElement("div")
    boot.className = "app-boot"
    boot.setAttribute(APP_BOOT_SCREEN_ATTR, "")
    boot.setAttribute("hidden", "")
    boot.innerHTML = `<button type="button" ${APP_BOOT_RETRY_ATTR}="">Try again</button>`
    document.body.appendChild(boot)
  })
  afterEach(() => {
    vi.useRealTimers()
    endAppBoot()
    boot.remove()
    sessionStorage.clear()
    localStorage.removeItem(MEMBER_KEY)
  })
  const firstPaint = () => {
    document.documentElement.setAttribute("data-app-boot", "")
    boot.removeAttribute("hidden")
  }

  it("holds the first paint's splash, drawing nothing of its own and no spinner", async () => {
    firstPaint()
    profile = loading
    const view = page()
    await act(async () => {})
    expect(appBootState()).toBe("held")
    expect(view.container.querySelector("[data-splash]")).toBeNull()
    expect(view.container.querySelector(".animate-spin, svg.lucide-loader-circle, svg.lucide-loader")).toBeNull()
  })

  it("puts the same splash up when the app opens from the sign-in page", async () => {
    profile = loading
    page()
    await act(async () => {})
    expect(appBootState()).toBe("held")
    expect(boot.hidden).toBe(false)
  })

  it("draws the same scene itself where the layout has no splash, naming the workspace", async () => {
    boot.remove()
    profile = loading
    const view = page()
    await act(async () => {})
    expect(screen.getByRole("status").textContent).toMatch(/^Opening /)
    expect(view.container.querySelector(".app-frame.splash [data-splash-scene]")).toBeTruthy()
    expect(view.container.querySelector(".animate-spin, svg.lucide-loader-circle, svg.lucide-loader")).toBeNull()
  })

  it("says it is still connecting after 8 seconds, and Try again asks again", async () => {
    vi.useFakeTimers()
    firstPaint()
    profile = loading
    page()
    await act(async () => void vi.advanceTimersByTime(8100))
    expect(appBootState()).toBe("slow")
    boot.querySelector("button")!.click()
    expect(mutate).toHaveBeenCalled()
  })

  it("says so in its own splash too, where the layout has none", async () => {
    vi.useFakeTimers()
    boot.remove()
    profile = loading
    page()
    await act(async () => void vi.advanceTimersByTime(8100))
    expect(screen.getByText(/Still connecting to/)).toBeTruthy()
    screen.getByRole("button", { name: "Try again" }).click()
    expect(mutate).toHaveBeenCalled()
  })

  // A reload swapped the first paint's splash for a skeleton of a shell that
  // didn't match the real one (a fixed 248 px sidebar; on a phone an empty
  // sheet): two screens and a jump. A reload opens as any open does.
  it("is the same splash on a reload, never a skeleton shell", async () => {
    sessionStorage.setItem("onecamp:opened", "1")
    firstPaint()
    profile = loading
    const view = page()
    await act(async () => {})
    expect(view.container.querySelector("[data-skeleton-shell]")).toBeNull()
    expect(appBootState()).toBe("held")
  })

  it("puts an error on the same frame, with the crash spot, as the splash goes", async () => {
    firstPaint()
    profile = { isLoading: false, isValidating: false, isError: new Error("Network Error"), data: undefined }
    const view = page()
    await act(async () => {})
    expect(view.container.querySelector("[data-splash-error] [data-spot-crash]")).toBeTruthy()
    // One spot: the error state's own illustration is hidden, by the attribute it really has.
    const state = view.container.querySelector("[data-splash-error] [data-empty-illustration]")!.closest("[class*='data-empty-illustration']")
    expect(state?.className).toContain("[&_[data-empty-illustration]]:hidden")
    expect(appBootState()).toBe("leaving")
  })

  // The splash went at once and the shell faded up from nothing over the
  // page's own colour, so the frame's glow vanished and the screen dipped to
  // white (in light) on the way in. The app is drawn whole at once now, and
  // the splash fades out over it.
  it("cross-fades into the app: the app drawn at once under it, then the splash leaves", async () => {
    vi.useFakeTimers()
    firstPaint()
    profile = loading
    const view = page()
    await act(async () => {})
    profile = ready
    view.rerender(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    await act(async () => {})
    expect(screen.getByText("the app").closest(".shell-enter")).toBeNull()
    expect(appBootState()).toBe("leaving")
    vi.advanceTimersByTime(APP_BOOT_LEAVE_MS)
    expect(appBootState()).toBeNull()
  })

  // The app went before it was ready: Back, during the wait, to a page
  // outside it that came in without a reload. No other page takes the splash
  // down, so the app lets it go as it leaves.
  it("lets the splash go when the app goes before it is ready", async () => {
    firstPaint()
    profile = loading
    const view = page()
    await act(async () => {})
    expect(appBootState()).toBe("held")
    view.unmount()
    expect(appBootState()).toBeNull()
    expect(boot.hidden).toBe(true)
  })

  // The start page shows the splash from its first paint in a browser a
  // member has used (lib/appBoot): this is where that is known.
  it("remembers that a member uses this browser", async () => {
    profile = ready
    page()
    await act(async () => {})
    expect(localStorage.getItem(MEMBER_KEY)).toBe("1")
  })
})
