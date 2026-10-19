import { afterEach, describe, expect, it, vi } from "vitest"
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

vi.mock("@/hooks/useMqttConnection", () => ({
  useMqttConnection: () => ({
    connectionState,
    connect: noop,
    disconnect: noop,
    reconnect,
    publish: async () => {},
    subscribeToTopic: noop,
    unsubscribeFromTopic: noop,
  }),
}))
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

afterEach(() => {
  cleanup()
  connectionState = { isConnected: true, isConnecting: false, error: null, reconnectAttempts: 0 }
  reconnect.mockClear()
})

describe("the realtime provider's light readers", () => {
  it("read the provider's own connection through components/mqtt/mqttContext", () => {
    let read: unknown
    function Reader() {
      read = useMqttConnectionState()
      return null
    }
    render(
      <App>
        <Reader />
      </App>,
    )
    expect(read).toBe(connectionState)
  })

  it("hear the connection drop: the pill under the provider says so, and Reconnect reaches it", () => {
    const view = render(
      <App>
        <FootPill />
      </App>,
    )
    expect(screen.queryByRole("status")).toBeNull()
    connectionState = { ...connectionState, isConnected: false, reconnectAttempts: 5 }
    view.rerender(
      <App>
        <FootPill />
      </App>,
    )
    expect(screen.getByRole("status").textContent).toMatch(/Live updates paused · trying every 30 s/)
    act(() => screen.getByRole("button", { name: "Reconnect" }).click())
    expect(reconnect).toHaveBeenCalledOnce()
  })
})
