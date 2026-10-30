import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { act, cleanup, render, screen } from "@testing-library/react"
import store from "@/store/store"

// The realtime provider gives its connection through the context its light
// readers use (components/mqtt/mqttContext). The connection pill is on every
// page, signed in or not, so it reads the context there and never brings the
// provider and its handlers (17 Oct 2026, app/firstLoad.test.ts ROOT_LAZY). A
// provider with a context of its own would leave the pill saying nothing while
// live updates were down; the pill's own tests give it the context directly.

let connectionState = { isConnected: true, isConnecting: false, error: null as string | null, reconnectAttempts: 0 }
const reconnect = vi.fn()
const noop = () => {}
// The connection's state as the real hook keeps it: a change draws the engine
// that holds it again (the engine is drawn once by its provider, then by itself).
const heard = new Set<() => void>()
const setConnectionState = (next: typeof connectionState) => {
  connectionState = next
  heard.forEach((l) => l())
}

vi.mock("@/hooks/useMqttConnection", async () => {
  const { useSyncExternalStore } = await import("react")
  return {
    useMqttConnection: () => ({
      connectionState: useSyncExternalStore(
        (l) => (heard.add(l), () => void heard.delete(l)),
        () => connectionState,
      ),
      connect: noop,
      disconnect: noop,
      reconnect,
      publish: async () => {},
      subscribeToTopic: noop,
      unsubscribeFromTopic: noop,
    }),
  }
})
vi.mock("@/hooks/useMqttMessageHandler", () => ({ useMqttMessageHandler: () => ({ handleMessage: noop, cleanup: noop }) }))
vi.mock("@/hooks/useMessageSyncManager", () => ({
  useMessageSyncManager: () => ({ markHealthy: noop, handleDisconnected: noop, handleConnectionEstablished: noop, handleForeground: noop }),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: (url: string) =>
    url.includes("mqtt") ? { data: undefined, isError: undefined, mutate: noop } : { data: { data: { user_uuid: "u1" } }, isError: undefined, mutate: noop },
}))
vi.mock("@/hooks/useUpdateReady", () => ({ useUpdateReady: () => ({ ready: false, reload: noop }) }))

import { MqttProvider } from "@/components/mqtt/mqttProvider"
import { useMqttConnectionState } from "@/components/mqtt/mqttContext"
import { FootPill } from "@/components/error/OfflineNotice"

function App({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <MqttProvider>{children}</MqttProvider>
    </Provider>
  )
}

// The engine (components/mqtt/RealtimeEngine) starts at the first idle moment: at once here.
beforeEach(() => {
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0))
  vi.stubGlobal("cancelIdleCallback", (id: number) => clearTimeout(id))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setConnectionState({ isConnected: true, isConnecting: false, error: null, reconnectAttempts: 0 })
  reconnect.mockClear()
})

describe("the realtime provider's light readers", () => {
  it("read the provider's own connection through components/mqtt/mqttContext, connecting until its engine has started", async () => {
    let read: { isConnected: boolean; isConnecting: boolean } | undefined
    function Reader() {
      read = useMqttConnectionState()
      return null
    }
    render(
      <App>
        <Reader />
      </App>,
    )
    expect(read).toMatchObject({ isConnected: false, isConnecting: true })
    await vi.waitFor(() => expect(read).toBe(connectionState))
  })

  it("hear the connection drop: the pill under the provider says so, and Reconnect reaches it", async () => {
    let read: unknown
    function Reader() {
      read = useMqttConnectionState()
      return null
    }
    render(
      <App>
        <FootPill />
        <Reader />
      </App>,
    )
    // Connecting, before the engine has started, is no drop: the pill says nothing.
    expect(screen.queryByRole("status")).toBeNull()
    await vi.waitFor(() => expect(read).toBe(connectionState))
    expect(screen.queryByRole("status")).toBeNull()
    act(() => setConnectionState({ ...connectionState, isConnected: false, reconnectAttempts: 5 }))
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Live updates paused · trying every 30 s/))
    act(() => screen.getByRole("button", { name: "Reconnect" }).click())
    expect(reconnect).toHaveBeenCalledOnce()
  })
})
