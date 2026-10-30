import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"

// What waited for this sign-in is carried on once the person is in, and
// lib/afterSignIn is loaded only then: it is off the app's first load
// (app/firstLoad.test.ts), and a sign-in with nothing waiting never loads it.

const { replace, loads } = vi.hoisted(() => ({ replace: vi.fn(), loads: { n: 0 } }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ isLoading: false, isValidating: false, isError: undefined, data: { data: { user_uuid: "u", user_name: "Sam" } }, mutate: vi.fn() }),
}))
vi.mock("axios", () => ({ default: { post: vi.fn().mockResolvedValue({}) } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/store/store", () => ({ default: { dispatch: vi.fn() }, persistor: { purge: vi.fn() }, RESET_STORE_ACTION: "reset" }))
vi.mock("@/lib/afterSignIn", async (orig) => {
  loads.n++
  return orig()
})

import { AppProtectedRoute } from "@/components/protectedRoute/appProtectedRoute"

afterEach(() => {
  cleanup()
  replace.mockClear()
  sessionStorage.clear()
})

describe("after sign-in", () => {
  it("loads nothing more when nothing waits", async () => {
    render(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    await act(async () => {})
    expect(loads.n).toBe(0)
    expect(replace).not.toHaveBeenCalled()
  })

  it("carries on a copy started while signed out, once", async () => {
    sessionStorage.setItem("oc.afterSignIn", JSON.stringify({ kind: "copyPage", slug: "launch-notes", at: Date.now() }))
    render(<AppProtectedRoute><p>the app</p></AppProtectedRoute>)
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/p/launch-notes?copy=1"))
    expect(loads.n).toBe(1)
    expect(sessionStorage.getItem("oc.afterSignIn")).toBeNull()
  })
})
