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
vi.mock("@/lib/afterSignIn", () => ({ takeAfterSignIn: () => null }))
// The profile kept on this device for an unanswered start (lib/swrCache), set by each test.
const kept = vi.fn()
// Only what this page asks of it: the real module would also join the session's end (its own cache's
// forget), which this file's session tests don't count on.
vi.mock("@/lib/swrCache", () => ({ keptProfile: (e: unknown) => kept(e) }))

import { AppProtectedRoute, sessionGone } from "@/components/protectedRoute/appProtectedRoute"
import { SESSION_ENDED_KEY, onSessionEnd } from "@/lib/sessionEnd"
import { APP_BOOT_LEAVE_MS, APP_BOOT_RETRY_ATTR, APP_BOOT_SCREEN_ATTR, appBootState, endAppBoot } from "@/lib/appBoot"
import { MEMBER_KEY } from "@/lib/memberMark"
import { heardRefusal } from "@/lib/http/answered"

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

describe("the session's refresh clock", () => {
  afterEach(() => localStorage.clear())

  // A sign-in enters the app without a reload (the sign-in page's
  // router.push), from a page that knew of no session: the clock starts
  // here, or nothing would refresh the cookie before it ran out.
  it("starts when the app sees the member", async () => {
    // No session known: storage cleared, as a sign-out in another tab leaves it.
    localStorage.clear()
    window.dispatchEvent(new StorageEvent("storage", { key: null }))
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "u", user_name: "Sam" } } }
    page()
    await screen.findByText("the app")
    expect(Number(localStorage.getItem("onecamp:token-issued-at"))).toBeGreaterThan(Date.now() - 5000)
  })
})

describe("a member deactivated or removed while offline (asana-12)", () => {
  it("is signed out on reconnect: a queued write the server refuses asks for the profile again, and its 403 signs out", async () => {
    const sam = { data: { user_uuid: "sam" } }
    profile = { isLoading: false, isValidating: false, isError: undefined, data: sam }
    const { rerender } = page()
    await act(async () => {})
    mutate.mockClear()
    await act(async () => {
      heardRefusal()
    })
    expect(mutate).toHaveBeenCalledWith()
    // The server's word on the profile: this member may no longer come in. Signing out ends the session, and the
    // Offline Store, its queue with it, goes with the session (lib/offline/wipe).
    profile = { isLoading: false, isValidating: false, isError: httpError(403), data: sam }
    rerender(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    await act(async () => {})
    expect(logout).toHaveBeenCalledTimes(1)
  })
})

describe("opening with no network (asana-12)", () => {
  // A profile request that never reached the server, as axios reports it.
  const unanswered = Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" })

  beforeEach(() => kept.mockReset())

  it("opens as the member this device last confirmed when the profile goes unanswered", async () => {
    kept.mockReturnValue({ data: { user_uuid: "sam" } })
    profile = { isLoading: false, isValidating: false, isError: unanswered, data: undefined }
    page()
    await act(async () => {})
    expect(kept).toHaveBeenCalledWith(unanswered)
    expect(mutate).toHaveBeenCalledWith({ data: { user_uuid: "sam" } }, { revalidate: false })
    expect(logout).not.toHaveBeenCalled()
  })

  it("offers to try again, as before, when nothing is kept here", async () => {
    kept.mockReturnValue(undefined)
    profile = { isLoading: false, isValidating: false, isError: unanswered, data: undefined }
    page()
    await act(async () => {})
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy()
  })

  it("never opens on it after a refusal: a 401 or a 403 signs out", async () => {
    kept.mockReturnValue({ data: { user_uuid: "sam" } })
    for (const status of [401, 403]) {
      logout.mockClear()
      mutate.mockClear()
      profile = { isLoading: false, isValidating: false, isError: httpError(status), data: undefined }
      page()
      await act(async () => {})
      expect(mutate, String(status)).not.toHaveBeenCalled()
      expect(logout, String(status)).toHaveBeenCalledTimes(1)
      cleanup()
    }
  })

  it("asks again once back online, and a refusal then signs out (a member deactivated or removed meanwhile)", async () => {
    const sam = { data: { user_uuid: "sam" } }
    kept.mockReturnValue(sam)
    profile = { isLoading: false, isValidating: false, isError: unanswered, data: undefined }
    const { rerender } = page()
    await act(async () => {})
    expect(mutate).toHaveBeenCalledWith(sam, { revalidate: false })
    // The app runs on what was kept; back online, the profile is asked again.
    profile = { isLoading: false, isValidating: false, isError: undefined, data: sam }
    rerender(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    expect(screen.getByText("the app")).toBeTruthy()
    mutate.mockClear()
    await act(async () => {
      window.dispatchEvent(new Event("online"))
    })
    expect(mutate).toHaveBeenCalledWith()
    // The server's word: this member may no longer come in.
    profile = { isLoading: false, isValidating: false, isError: httpError(403), data: sam }
    rerender(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    await act(async () => {})
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it("stops asking once the server has answered", async () => {
    const sam = { data: { user_uuid: "sam" } }
    kept.mockReturnValue(sam)
    profile = { isLoading: false, isValidating: false, isError: unanswered, data: undefined }
    const { rerender } = page()
    await act(async () => {})
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "sam", user_name: "Sam" } } }
    rerender(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    mutate.mockClear()
    await act(async () => {
      window.dispatchEvent(new Event("online"))
    })
    expect(mutate).not.toHaveBeenCalled()
  })

  it("uses nothing kept once the profile has answered", async () => {
    kept.mockReturnValue({ data: { user_uuid: "sam" } })
    profile = { isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "alex" } } }
    page()
    await act(async () => {})
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText("the app")).toBeTruthy()
  })
})
