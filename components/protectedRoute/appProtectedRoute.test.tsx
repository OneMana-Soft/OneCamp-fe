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

describe("whether a failure means the session is gone", () => {
  it("is only a 401 or a 403", () => {
    expect(sessionGone(httpError(401))).toBe(true)
    expect(sessionGone(httpError(403))).toBe(true)
    expect(sessionGone(httpError(500))).toBe(false)
    expect(sessionGone(new Error("Network Error"))).toBe(false)
    expect(sessionGone(undefined)).toBe(false)
  })
})
