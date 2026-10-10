import { afterEach, describe, expect, it, vi } from "vitest"
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

import { MqttProvider, useMqtt } from "./mqttProvider"

afterEach(cleanup)

describe("the realtime provider", () => {
  it("doesn't re-render its readers when only its own state changes", () => {
    let reads = 0
    function Reader() {
      useMqtt()
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
    const before = reads
    for (let n = 1; n <= 3; n++) act(() => void store.dispatch(updateUserConnectedDeviceCount({ userUUID: "u1", deviceConnected: n })))
    expect(reads).toBe(before)
  })
})
