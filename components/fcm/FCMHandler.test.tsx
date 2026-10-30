import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

// The foreground half of push. TN-BUG-9: it compared the page's path with the
// push's route, and a channel push routes to its post, so the channel being
// read raised a preview for every message in it, and the thread open beside
// it one for every reply. TN-BUG-14: the token was registered once per page
// load, and the server dropped tokens on any push error, so a tab or the
// desktop app open all day went without push until reloaded.

let onPush: ((payload: unknown) => void) | undefined
const registered = vi.fn<(o: unknown) => Promise<object>>(async () => ({}))
const previews = vi.fn<(t: unknown) => { dismiss: () => void }>(() => ({ dismiss: () => {} }))
const router = { push: vi.fn() }
vi.mock("@/lib/firebase", () => ({ getFCMToken: async () => "token-1", onForegroundMessage: (fn: (p: unknown) => void) => { onPush = fn; return () => { onPush = undefined } } }))
vi.mock("@/lib/push/firebaseConfig", () => ({ isFirebaseConfigured: true }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: registered, isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => previews(t) }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: SELF } } }) }))
vi.mock("@/lib/workerCommunication", () => ({ setWorkerUserUUID: () => {} }))
vi.mock("@/components/command/CommandActionBridge", () => ({ isDndActive: () => false }))

const SELF = "5e1f0000-0000-4000-8000-000000000001"
const MAYA = "a11ce000-0000-4000-8000-00000000000a"
const ENG = "c0ffee00-0000-4000-8000-000000000001"
const OPS = "c0ffee00-0000-4000-8000-000000000002"
const POST = "aaaa0000-0000-4000-8000-00000000000a"

const { default: store, RESET_STORE_ACTION } = await import("@/store/store")
const { openRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { FCMHandler, FCM_RESYNC_MS } = await import("@/components/fcm/FCMHandler")
const { QUIET_MS, SETTLE_MS } = await import("@/lib/ui/whenQuiet")

// The SDK waits for the first screen's settle and a quiet page (lib/ui/whenQuiet).
const fakeClock = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] })
const settle = () => act(() => vi.advanceTimersByTimeAsync(SETTLE_MS + QUIET_MS + 100))

const at = (path: string) => window.history.pushState({}, "", path)
const push = (data: Record<string, string>) => act(() => onPush?.({ data: { title: "Maya Chen", body: "hi", ...data } }))

beforeEach(() => {
  onPush = undefined
  // A quiet moment comes at once here; the listener waits for one (whenIdle).
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => window.setTimeout(cb, 0))
  vi.stubGlobal("cancelIdleCallback", (id: number) => window.clearTimeout(id))
  store.dispatch({ type: RESET_STORE_ACTION })
  registered.mockClear()
  previews.mockClear()
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  at("/")
})

describe("a push while the app is open", () => {
  // The listener subscribes once the first screen has settled and the SDK has come.
  const show = async () => {
    fakeClock()
    render(<Provider store={store}><FCMHandler /></Provider>)
    await settle()
    expect(onPush).toBeDefined()
  }

  it("is listened for only once the first screen has settled and the page is quiet: the SDK is not on it", async () => {
    fakeClock()
    render(<Provider store={store}><FCMHandler /></Provider>)
    // A phone at 4x is useful at about 3 s; the SDK came at 2 s.
    await act(() => vi.advanceTimersByTimeAsync(SETTLE_MS - 100))
    expect(onPush).toBeUndefined()
    await settle()
    expect(onPush).toBeDefined()
    cleanup()
    expect(onPush).toBeUndefined()
  })

  it("raises no preview for a message in the channel being read", async () => {
    await show()
    at(`/app/channel/${ENG}`)
    push({ type: "channel", type_id: ENG, thread_id: POST })
    expect(previews).not.toHaveBeenCalled()
  })

  // Calendar A5: a reminder is its own toast, with Join or Snooze, from the
  // live notice the server raises beside the push.
  it("leaves a calendar reminder to its own toast", async () => {
    await show()
    at("/app/home")
    push({ type: "calendar", type_id: ENG, tag: `reminder:${ENG}`, title: "Design review in 10 minutes" })
    expect(previews).not.toHaveBeenCalled()
  })

  it("raises one for a message in another channel", async () => {
    await show()
    at(`/app/channel/${OPS}`)
    push({ type: "channel", type_id: ENG, thread_id: POST })
    expect(previews).toHaveBeenCalledTimes(1)
  })

  it("raises one for a reply, unless its thread is open", async () => {
    await show()
    at(`/app/channel/${ENG}`)
    push({ type: "post_comment", type_id: ENG, thread_id: POST })
    expect(previews).toHaveBeenCalledTimes(1)
    act(() => void store.dispatch(openRightPanel({ channelUUID: ENG, postUUID: POST })))
    push({ type: "post_comment", type_id: ENG, thread_id: POST })
    expect(previews).toHaveBeenCalledTimes(1)
  })

  it("raises none for a DM from the person being read, and one from anyone else", async () => {
    await show()
    at(`/app/chat/${MAYA}`)
    push({ type: "chat", type_id: `${MAYA} ${SELF}`, thread_id: "m1" })
    expect(previews).not.toHaveBeenCalled()
    push({ type: "chat", type_id: `b0b00000-0000-4000-8000-00000000000b ${SELF}`, thread_id: "j1" })
    expect(previews).toHaveBeenCalledTimes(1)
  })
})

describe("the device's push token", () => {
  it("is registered on start once the first screen has settled, and again on coming back into view once it is old", async () => {
    fakeClock()
    render(<Provider store={store}><FCMHandler /></Provider>)
    await act(() => vi.advanceTimersByTimeAsync(3_000))
    expect(registered).not.toHaveBeenCalled()
    await settle()
    expect(registered).toHaveBeenCalledTimes(1)
    expect(registered.mock.calls[0][0]).toMatchObject({ payload: { fcm_token: "token-1" } })

    // Back into view a minute later: still fresh.
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
    expect(registered).toHaveBeenCalledTimes(1)

    // Back after a long while: registered again, in case the server dropped it.
    await act(() => vi.advanceTimersByTimeAsync(FCM_RESYNC_MS))
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(registered).toHaveBeenCalledTimes(2)
  })
})
