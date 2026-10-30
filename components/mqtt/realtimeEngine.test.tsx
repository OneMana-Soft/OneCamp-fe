import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Provider } from "react-redux"
import { act, cleanup, render } from "@testing-library/react"
import type { ReactNode } from "react"
import store from "@/store/store"

// The connection and its handlers are a chunk the light provider starts at
// the first idle moment (fluid-15), after the first screen fetched its
// conversations. A first connection that comes late fetches what was said in
// between, once, as a reconnect does; an early one fetches nothing more.
// Whenever a connection's subscriptions are answered, each open conversation
// reads what came after its newest message (the gap between its first read
// and the subscription, FLUIDITY-LEAD-8's rtGap).

const connect = vi.hoisted(() => ({
  onConnect: undefined as undefined | (() => void),
  onSubscribed: undefined as undefined | (() => void),
  onTopicLive: undefined as undefined | ((topic: string) => void),
  // When each topic went live on the connection, as the hook says.
  liveAt: new Map<string, number>(),
  subscribed: [] as string[],
}))
const noop = () => {}
vi.mock("@/hooks/useMqttConnection", () => ({
  useMqttConnection: (options: { onConnect?: () => void; onSubscribed?: () => void; onTopicLive?: (topic: string) => void }) => {
    connect.onConnect = options.onConnect
    connect.onSubscribed = options.onSubscribed
    connect.onTopicLive = options.onTopicLive
    return {
      topicLiveAt: (topic: string) => connect.liveAt.get(topic),
      connectionState: { isConnected: true, isConnecting: false, error: null, reconnectAttempts: 0 },
      connect: noop,
      disconnect: noop,
      reconnect: noop,
      publish: async () => {},
      subscribeToTopic: (topic: string) => void connect.subscribed.push(topic),
      unsubscribeFromTopic: noop,
    }
  },
}))
vi.mock("@/hooks/useMqttMessageHandler", () => ({ useMqttMessageHandler: () => ({ handleMessage: noop, cleanup: noop }) }))
vi.mock("@/hooks/useMessageSyncManager", () => ({
  useMessageSyncManager: () => ({ markHealthy: noop, handleDisconnected: noop, handleConnectionEstablished: noop, handleForeground: noop }),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: (url: string) =>
    url.includes("mqtt") ? { data: undefined, isError: undefined, mutate: noop } : { data: { data: { user_uuid: "u1" } }, isError: undefined, mutate: noop },
}))

const { MqttProvider } = await import("./mqttProvider")
const { useMqttTopic } = await import("@/hooks/useMqttTopic")

beforeEach(() => {
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0))
  vi.stubGlobal("cancelIdleCallback", (id: number) => clearTimeout(id))
  connect.onConnect = undefined
  connect.liveAt.clear()
  connect.subscribed.length = 0
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const nonce = () => store.getState().messageResync.nonce

async function engineAt(ms: number, page: ReactNode = <p>page</p>) {
  vi.spyOn(performance, "now").mockReturnValue(ms)
  render(
    <Provider store={store}>
      <MqttProvider>
        {page}
      </MqttProvider>
    </Provider>,
  )
  await vi.waitFor(() => expect(connect.onConnect).toBeTypeOf("function"))
}

describe("the realtime engine", () => {
  it("fetches what was said in between once, when its first connection comes late", async () => {
    await engineAt(5000)
    const before = nonce()
    connect.onConnect!()
    connect.onConnect!()
    expect(nonce()).toBe(before + 1)
  })

  it("fetches nothing more when its first connection comes early", async () => {
    await engineAt(1200)
    const before = nonce()
    connect.onConnect!()
    expect(nonce()).toBe(before)
  })

  it("asks the open conversations to catch up each time a connection's subscriptions are answered, early or late", async () => {
    await engineAt(1200)
    const catchUps = () => store.getState().messageResync.catchUpNonce
    const before = catchUps()
    connect.onConnect!()
    expect(catchUps(), "not on connecting: the subscriptions aren't answered yet").toBe(before)
    connect.onSubscribed!()
    expect(catchUps()).toBe(before + 1)
    connect.onConnect!()
    connect.onSubscribed!()
    expect(catchUps(), "and on every connection after").toBe(before + 2)
  })
})

/** A page that shows what it read and hears doc/1. */
function Page({ onLive }: { onLive: () => void }) {
  useMqttTopic({ topic: "doc/1", onLive })
  return <p>page</p>
}

describe("a page's topic going live", () => {
  // The page reads what it shows as it opens, and its topic goes live only
  // when the broker answers its subscription: what was sent in between
  // reached it neither way, so it reads again then (F5, REGRESSION-HUNT 26 Oct).
  it("reads again when its topic goes live after it opened, and on each connection after", async () => {
    const onLive = vi.fn()
    await engineAt(100, <Page onLive={onLive} />)
    await vi.waitFor(() => expect(connect.subscribed).toContain("doc/1"))
    expect(onLive).not.toHaveBeenCalled()
    connect.liveAt.set("doc/1", 200)
    act(() => connect.onTopicLive!("doc/1"))
    expect(onLive).toHaveBeenCalledTimes(1)
    act(() => connect.onTopicLive!("doc/2"))
    expect(onLive, "another topic's answer isn't the page's").toHaveBeenCalledTimes(1)
    act(() => connect.onTopicLive!("doc/1"))
    expect(onLive, "the next connection's answer").toHaveBeenCalledTimes(2)
  })

  it("reads again at once when its topic went live after it opened but before it subscribed", async () => {
    connect.liveAt.set("doc/1", 150)
    const onLive = vi.fn()
    await engineAt(100, <Page onLive={onLive} />)
    await vi.waitFor(() => expect(onLive).toHaveBeenCalledTimes(1))
  })

  it("doesn't read again for a topic that was live before it opened", async () => {
    connect.liveAt.set("doc/1", 50)
    const onLive = vi.fn()
    await engineAt(100, <Page onLive={onLive} />)
    await vi.waitFor(() => expect(connect.subscribed).toContain("doc/1"))
    expect(onLive).not.toHaveBeenCalled()
  })
})
