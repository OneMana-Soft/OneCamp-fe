import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { act, cleanup, render } from "@testing-library/react"
import store from "@/store/store"
import { updateUserConnectedDeviceCount } from "@/store/slice/userSlice"

// What the realtime provider hands to its readers is one object while nothing
// in it changes. It was a new object on every render of the provider (a device
// count, a config answer), and every reader of the connection re-rendered.

const connection = {
  connectionState: "connected",
  connect: () => {},
  disconnect: () => {},
  publish: async () => {},
  subscribeToTopic: () => {},
  unsubscribeFromTopic: () => {},
}
const handler = { handleMessage: () => {}, cleanup: () => {} }
const sync = { markHealthy: () => {}, handleDisconnected: () => {}, handleConnectionEstablished: () => {}, handleForeground: () => {} }
const profile = { data: { data: { user_uuid: "u1" } }, isError: undefined, mutate: () => {} }
const config = { data: undefined, isError: undefined, mutate: () => {} }

vi.mock("@/hooks/useMqttConnection", () => ({ useMqttConnection: () => connection }))
vi.mock("@/hooks/useMqttMessageHandler", () => ({ useMqttMessageHandler: () => handler }))
vi.mock("@/hooks/useMessageSyncManager", () => ({ useMessageSyncManager: () => sync }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: (url: string) => (url.includes("mqtt") ? config : profile),
}))

import { MqttProvider } from "./mqttProvider"
import { useMqtt } from "./mqttContext"

// The engine (components/mqtt/RealtimeEngine) starts at the first idle moment: at once here.
beforeEach(() => {
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0))
  vi.stubGlobal("cancelIdleCallback", (id: number) => clearTimeout(id))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the realtime provider", () => {
  it("doesn't re-render its readers when only its own state changes", async () => {
    let reads = 0
    let seen: unknown
    function Reader() {
      seen = useMqtt().connectionState
      reads++
      return null
    }
    render(
      <Provider store={store}>
        <MqttProvider>
          <Reader />
        </MqttProvider>
      </Provider>,
    )
    // The engine has started and handed its connection up.
    await vi.waitFor(() => expect(seen).toBe(connection.connectionState))
    const before = reads
    for (let n = 1; n <= 3; n++) act(() => void store.dispatch(updateUserConnectedDeviceCount({ userUUID: "u1", deviceConnected: n })))
    expect(reads).toBe(before)
  })
})
