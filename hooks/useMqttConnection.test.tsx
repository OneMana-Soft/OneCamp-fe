import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { EventEmitter } from "events"

// The broker asks the server before every subscription, so it can refuse one
// for a moment (the server restarting in a deploy, a stale answer on a channel
// just joined). The hook asks again for a refused topic, a few times, while
// it's connected and the topic is still wanted. A fake client stands in for
// the broker; the hook runs as the app runs it.

type Answer = (err: Error | null, granted?: { topic: string; qos: number }[], suback?: { granted: number[] }) => void

class FakeClient extends EventEmitter {
  connected = false
  subscribes: { topics: string[]; answer: Answer }[] = []
  subscribe(topics: string | Record<string, unknown>, opts?: unknown, cb?: Answer) {
    const answer = (typeof opts === "function" ? opts : cb) as Answer
    this.subscribes.push({ topics: typeof topics === "string" ? [topics] : Object.keys(topics), answer })
    return this
  }
  unsubscribe(_topics: unknown, cb?: () => void) {
    cb?.()
    return this
  }
  publish() {
    return this
  }
  end() {
    this.connected = false
    return this
  }
}

const clients: FakeClient[] = []
vi.mock("@/lib/mqtt/loadConnect", () => ({
  loadConnect: async () => () => {
    const client = new FakeClient()
    clients.push(client)
    return client
  },
}))

import { useMqttConnection } from "./useMqttConnection"

const CONFIG = { clientId: "c", username: "u", password: "p", topics: ["chat/a", "chat/b"] }
const CONNECTION = { wsUrl: "ws://localhost:8083", wsPort: 8083, reconnectInterval: 1000, maxReconnectAttempts: 10, typingTimeout: 4000 }

/** The broker's SUBACK for a subscribe: one code per topic, 0x87 refusing it. */
function answer(sub: { topics: string[]; answer: Answer }, codes: number[]) {
  const refused = codes.some((c) => c >= 0x80)
  act(() =>
    sub.answer(
      refused ? new Error("Subscribe error: Not authorized") : null,
      sub.topics.map((topic) => ({ topic, qos: 1 })),
      { granted: codes },
    ),
  )
}
const after = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

/** The hook, connected, with its first subscribe (the config's topics) asked. */
async function connected() {
  const hook = renderHook(() => useMqttConnection({ config: CONFIG, connectionConfig: CONNECTION }))
  await after(100) // the settle delay before the first connection, and the library loading
  const client = clients[clients.length - 1]
  act(() => {
    client.connected = true
    client.emit("connect", {})
  })
  expect(client.subscribes[0].topics).toEqual(["chat/a", "chat/b"])
  return { ...hook, client }
}

beforeEach(() => {
  vi.useFakeTimers()
  clients.length = 0
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("a topic the broker refused", () => {
  it("is asked for again about 5 s, 15 s, 45 s and 2 minutes later, then given up", async () => {
    const { client, unmount } = await connected()
    answer(client.subscribes[0], [1, 0x87])
    for (const [i, wait] of [5_000, 15_000, 45_000, 120_000].entries()) {
      await after(wait - 1)
      expect(client.subscribes).toHaveLength(1 + i)
      await after(1)
      expect(client.subscribes).toHaveLength(2 + i)
      expect(client.subscribes[1 + i].topics).toEqual(["chat/b"])
      answer(client.subscribes[1 + i], [0x87])
    }
    await after(10 * 60_000)
    expect(client.subscribes).toHaveLength(5)
    unmount()
  })

  it("is subscribed once the broker grants it, and nothing else is asked again", async () => {
    const { client, unmount } = await connected()
    answer(client.subscribes[0], [1, 0x87])
    await after(5_000)
    answer(client.subscribes[1], [1])
    await after(10 * 60_000)
    expect(client.subscribes.map((s) => s.topics)).toEqual([["chat/a", "chat/b"], ["chat/b"]])
    unmount()
  })

  it("isn't asked for again once the connection is lost", async () => {
    const { client, unmount } = await connected()
    answer(client.subscribes[0], [1, 0x87])
    act(() => {
      client.connected = false
      client.emit("close")
    })
    await after(10 * 60_000)
    expect(client.subscribes).toHaveLength(1)
    unmount()
  })

  it("isn't asked for again while the client says it isn't connected", async () => {
    const { client, unmount } = await connected()
    answer(client.subscribes[0], [1, 0x87])
    client.connected = false // a dead socket, not yet noticed
    await after(5_000)
    expect(client.subscribes).toHaveLength(1)
    unmount()
  })

  it("isn't asked for again once the page has let go of it", async () => {
    const { client, result, unmount } = await connected()
    answer(client.subscribes[0], [1, 1])
    act(() => result.current.subscribeToTopic("doc/d1"))
    expect(client.subscribes[1].topics).toEqual(["doc/d1"])
    answer(client.subscribes[1], [0x87])
    act(() => result.current.unsubscribeFromTopic("doc/d1"))
    await after(10 * 60_000)
    expect(client.subscribes).toHaveLength(2)
    unmount()
  })

  it("isn't asked for again once the config no longer lists it", async () => {
    const hook = renderHook((config: typeof CONFIG) => useMqttConnection({ config, connectionConfig: CONNECTION }), {
      initialProps: CONFIG,
    })
    await after(100)
    const client = clients[clients.length - 1]
    act(() => {
      client.connected = true
      client.emit("connect", {})
    })
    answer(client.subscribes[0], [1, 0x87])
    hook.rerender({ ...CONFIG, password: "p2", topics: ["chat/a"] })
    await after(10 * 60_000)
    expect(client.subscribes).toHaveLength(1)
    hook.unmount()
  })

  it("is asked for again when it's a dynamic topic the page still wants", async () => {
    const { client, result, unmount } = await connected()
    answer(client.subscribes[0], [1, 1])
    act(() => result.current.subscribeToTopic("doc/d1"))
    answer(client.subscribes[1], [0x87])
    await after(5_000)
    expect(client.subscribes[2].topics).toEqual(["doc/d1"])
    unmount()
  })

  it("is tried afresh on a new connection, after being given up", async () => {
    const { client, unmount } = await connected()
    answer(client.subscribes[0], [1, 0x87])
    for (const wait of [5_000, 15_000, 45_000, 120_000]) {
      await after(wait)
      answer(client.subscribes[client.subscribes.length - 1], [0x87])
    }
    expect(client.subscribes).toHaveLength(5)
    act(() => void client.emit("connect", {})) // connected again
    expect(client.subscribes[5].topics).toEqual(["chat/a", "chat/b"])
    answer(client.subscribes[5], [1, 0x87])
    await after(5_000)
    expect(client.subscribes[6].topics).toEqual(["chat/b"])
    unmount()
  })

  it("isn't asked for again once the page has gone", async () => {
    const { client, unmount } = await connected()
    answer(client.subscribes[0], [1, 0x87])
    unmount()
    await after(10 * 60_000)
    expect(client.subscribes).toHaveLength(1)
  })
})
