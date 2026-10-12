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
vi.mock("@/lib/firebase", () => ({ getFCMToken: async () => "token-1", isFirebaseConfigured: true, messaging: {} }))
vi.mock("firebase/messaging", () => ({ onMessage: (_m: unknown, fn: (p: unknown) => void) => { onPush = fn; return () => {} } }))
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

const at = (path: string) => window.history.pushState({}, "", path)
const push = (data: Record<string, string>) => act(() => onPush?.({ data: { title: "Maya Chen", body: "hi", ...data } }))

beforeEach(() => {
  store.dispatch({ type: RESET_STORE_ACTION })
  registered.mockClear()
  previews.mockClear()
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  at("/")
})

describe("a push while the app is open", () => {
  const show = () => render(<Provider store={store}><FCMHandler /></Provider>)

  it("raises no preview for a message in the channel being read", () => {
    show()
    at(`/app/channel/${ENG}`)
    push({ type: "channel", type_id: ENG, thread_id: POST })
    expect(previews).not.toHaveBeenCalled()
  })

  it("raises one for a message in another channel", () => {
    show()
    at(`/app/channel/${OPS}`)
    push({ type: "channel", type_id: ENG, thread_id: POST })
    expect(previews).toHaveBeenCalledTimes(1)
  })

  it("raises one for a reply, unless its thread is open", () => {
    show()
    at(`/app/channel/${ENG}`)
    push({ type: "post_comment", type_id: ENG, thread_id: POST })
    expect(previews).toHaveBeenCalledTimes(1)
    act(() => void store.dispatch(openRightPanel({ channelUUID: ENG, postUUID: POST })))
    push({ type: "post_comment", type_id: ENG, thread_id: POST })
    expect(previews).toHaveBeenCalledTimes(1)
  })

  it("raises none for a DM from the person being read, and one from anyone else", () => {
    show()
    at(`/app/chat/${MAYA}`)
    push({ type: "chat", type_id: `${MAYA} ${SELF}`, thread_id: "m1" })
    expect(previews).not.toHaveBeenCalled()
    push({ type: "chat", type_id: `b0b00000-0000-4000-8000-00000000000b ${SELF}`, thread_id: "j1" })
    expect(previews).toHaveBeenCalledTimes(1)
  })
})

describe("the device's push token", () => {
  it("is registered on start, and again on coming back into view once it is old", async () => {
    vi.useFakeTimers()
    render(<Provider store={store}><FCMHandler /></Provider>)
    await act(() => vi.advanceTimersByTimeAsync(3_000))
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
