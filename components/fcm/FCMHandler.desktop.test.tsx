import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// In the desktop app (TN-BUG-12): no web push at all, so a webview that one
// day offered it couldn't notify twice beside the desktop notices; permission
// is asked once, for the notification plugin; and a notice's route, sent when
// the person comes back to the window, is opened.

let subscribed = false
const registered = vi.fn<(o: unknown) => Promise<object>>(async () => ({}))
const router = { push: vi.fn() }
vi.mock("@/lib/firebase", () => ({ getFCMToken: async () => "token-1", onForegroundMessage: () => { subscribed = true; return () => {} } }))
vi.mock("@/lib/push/firebaseConfig", () => ({ isFirebaseConfigured: true }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: registered, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: () => ({ dismiss: () => {} }) }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "5e1f0000-0000-4000-8000-000000000001" } } }) }))
vi.mock("@/lib/workerCommunication", () => ({ setWorkerUserUUID: () => {} }))
vi.mock("@/components/command/CommandActionBridge", () => ({ isDndActive: () => false }))

const requestPermission = vi.fn(async () => "granted")
vi.stubGlobal("Notification", Object.assign(function Notification() {}, { requestPermission }))

const { default: store } = await import("@/store/store")
const { DESKTOP_OPEN_ROUTE_EVENT } = await import("@/lib/desktopApp")
const { FCMHandler } = await import("@/components/fcm/FCMHandler")
const { QUIET_MS, SETTLE_MS } = await import("@/lib/ui/whenQuiet")

beforeEach(() => {
  ;(window as unknown as { __TAURI__?: object }).__TAURI__ = {}
  subscribed = false
  registered.mockClear()
  router.push.mockClear()
  requestPermission.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (window as unknown as { __TAURI__?: object }).__TAURI__
})

describe("FCMHandler in the desktop app", () => {
  it("never sets up web push", async () => {
    vi.useFakeTimers()
    render(<Provider store={store}><FCMHandler /></Provider>)
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
    expect(registered).not.toHaveBeenCalled()
    expect(subscribed).toBe(false)
  })

  it("asks for notification permission once", async () => {
    render(<Provider store={store}><FCMHandler /></Provider>)
    await act(async () => {})
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it("opens the route a notice sends, and only a route in the app", async () => {
    render(<Provider store={store}><FCMHandler /></Provider>)
    act(() => void window.dispatchEvent(new CustomEvent(DESKTOP_OPEN_ROUTE_EVENT, { detail: "/app/chat/a11ce000-0000-4000-8000-00000000000a" })))
    expect(router.push).toHaveBeenCalledWith("/app/chat/a11ce000-0000-4000-8000-00000000000a")
    act(() => void window.dispatchEvent(new CustomEvent(DESKTOP_OPEN_ROUTE_EVENT, { detail: "https://elsewhere.example/" })))
    expect(router.push).toHaveBeenCalledTimes(1)
  })

  it("leaves a browser tab's web push as it was", async () => {
    delete (window as unknown as { __TAURI__?: object }).__TAURI__
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] })
    render(<Provider store={store}><FCMHandler /></Provider>)
    await act(() => vi.advanceTimersByTimeAsync(SETTLE_MS + QUIET_MS + 100))
    expect(registered).toHaveBeenCalledTimes(1)
    expect(subscribed).toBe(true)
    expect(requestPermission).not.toHaveBeenCalled()
  })
})
