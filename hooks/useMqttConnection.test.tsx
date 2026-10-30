import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
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
  unsubscribes: string[][] = []
  subscribe(topics: string | Record<string, unknown>, opts?: unknown, cb?: Answer) {
    const answer = (typeof opts === "function" ? opts : cb) as Answer
    this.subscribes.push({ topics: typeof topics === "string" ? [topics] : Object.keys(topics), answer })
    return this
  }
  unsubscribe(topics: string | string[], cb?: () => void) {
    this.unsubscribes.push(typeof topics === "string" ? [topics] : topics)
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

vi.mock("@/lib/mqtt/tabClientId", () => ({ tabClientId: async () => "tab1" }))

import { useMqttConnection } from "./useMqttConnection"

const CONFIG = { clientId: "c", username: "u", password: "p", topics: ["chat/a", "chat/b"] }
const CONNECTION = { wsUrl: "ws://localhost:8083", wsPort: 8083, reconnectInterval: 1000, typingTimeout: 4000 }

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
  // A test that failed before its unmount leaves no hook listening behind.
  cleanup()
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

/** Connected, as the app connects: the settings can change after. */
async function connectedWith(config: typeof CONFIG) {
  const hook = renderHook((c: typeof CONFIG) => useMqttConnection({ config: c, connectionConfig: CONNECTION }), { initialProps: config })
  await after(100)
  const client = clients[clients.length - 1]
  act(() => {
    client.connected = true
    client.emit("connect", {})
  })
  answer(client.subscribes[0], client.subscribes[0].topics.map(() => 1))
  return { ...hook, client }
}

/** The connection drops, as a broker restart drops it. */
function drop(client: FakeClient) {
  act(() => {
    client.connected = false
    client.emit("close")
  })
}

// A page that takes up one of the settings' topics for itself (a task chip
// or a doc's task list takes its project's) and then lets go of it leaves the
// topic with the connection: the app's router still reads that project's
// messages, and nothing would take the topic up again before a reconnect.
describe("a topic the page lets go of", () => {
  // What the client is asked to let go of from now on.
  const lettingGo = (client: FakeClient) => {
    const before = client.unsubscribes.length
    return () => client.unsubscribes.slice(before)
  }

  it("stays while the settings name it", async () => {
    const { client, result, unmount } = await connectedWith(CONFIG)
    const since = lettingGo(client)
    act(() => result.current.subscribeToTopic("chat/b"))
    act(() => result.current.unsubscribeFromTopic("chat/b"))
    expect(since()).toEqual([])
    unmount()
  })

  it("goes when only the page wanted it", async () => {
    const { client, result, unmount } = await connectedWith(CONFIG)
    const since = lettingGo(client)
    act(() => result.current.subscribeToTopic("doc/d-1"))
    act(() => result.current.unsubscribeFromTopic("doc/d-1"))
    expect(since()).toEqual([["doc/d-1"]])
    unmount()
  })

  it("goes once the settings stop naming it as well", async () => {
    const { client, result, rerender, unmount } = await connectedWith(CONFIG)
    act(() => result.current.subscribeToTopic("chat/b"))
    rerender({ ...CONFIG, password: "p2", topics: ["chat/a"] })
    const since = lettingGo(client)
    act(() => result.current.unsubscribeFromTopic("chat/b"))
    expect(since()).toEqual([["chat/b"]])
    unmount()
  })
})

// A conversation started, joined or added to after the page loaded never
// streamed: its topic was in none of the settings the connection subscribed
// to. The settings are fetched again, and the connection takes up what's new
// and lets go of what's gone, without reconnecting.
describe("a later settings answer", () => {
  it("subscribes to a topic it names first, without reconnecting", async () => {
    const { client, rerender, unmount } = await connectedWith(CONFIG)
    rerender({ ...CONFIG, password: "p2", clientId: "c2", topics: ["chat/a", "chat/b", "chat/new-dm"] })
    expect(clients).toHaveLength(1)
    expect(client.subscribes.map((s) => s.topics)).toEqual([["chat/a", "chat/b"], ["chat/new-dm"]])
    unmount()
  })

  it("lets go of a topic it no longer names (a channel left, a group's old id)", async () => {
    const { client, rerender, unmount } = await connectedWith(CONFIG)
    rerender({ ...CONFIG, password: "p2", topics: ["chat/a"] })
    expect(client.unsubscribes).toContainEqual(["chat/b"])
    expect(clients).toHaveLength(1)
    unmount()
  })

  it("keeps a topic the page still wants for itself", async () => {
    const { client, result, rerender, unmount } = await connectedWith(CONFIG)
    act(() => result.current.subscribeToTopic("chat/b"))
    rerender({ ...CONFIG, password: "p2", topics: ["chat/a"] })
    expect(client.unsubscribes).not.toContainEqual(["chat/b"])
    unmount()
  })

  it("is what a later try subscribes to, not the first settings", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const { client, rerender, unmount } = await connectedWith(CONFIG)
    rerender({ ...CONFIG, password: "p2", topics: ["chat/a", "chat/new-dm"] })
    drop(client)
    // The tries made at once fail too, for the whole first second: the next
    // one is made by the timer the first connection set up, at about 3 s.
    const dropped = new Set<FakeClient>([client])
    for (let t = 0; t < 1_500; t += 50) {
      await after(50)
      for (const c of clients) {
        if (!dropped.has(c)) {
          dropped.add(c)
          drop(c)
        }
      }
    }
    await after(2_000)
    const later = clients[clients.length - 1]
    expect(dropped.has(later)).toBe(false)
    act(() => {
      later.connected = true
      later.emit("connect", {})
    })
    expect(later.subscribes[0].topics).toEqual(["chat/a", "chat/new-dm"])
    unmount()
  })

  it("is what the next connection subscribes to", async () => {
    const { client, rerender, unmount } = await connectedWith(CONFIG)
    rerender({ ...CONFIG, password: "p2", topics: ["chat/a", "chat/new-dm"] })
    drop(client)
    await after(1_300) // the first wait, and the settle delay
    const next = clients[clients.length - 1]
    expect(next).not.toBe(client)
    act(() => {
      next.connected = true
      next.emit("connect", {})
    })
    expect(next.subscribes[0].topics).toEqual(["chat/a", "chat/new-dm"])
    unmount()
  })
})

// A session the broker didn't keep (a restart, more than an hour away) holds
// nothing: the new connection asks for every topic the page took up since it
// loaded, not only those the first settings named.
describe("a fresh session", () => {
  it("subscribes again to every topic taken up after load", async () => {
    const { client, result, rerender, unmount } = await connectedWith(CONFIG)
    act(() => result.current.subscribeToTopic("doc/d1")) // a doc opened after load
    rerender({ ...CONFIG, password: "p2", topics: [...CONFIG.topics, "chat/new-dm"] }) // a DM started after load
    drop(client)
    await after(150)
    const next = clients[clients.length - 1]
    expect(next).not.toBe(client)
    act(() => {
      next.connected = true
      next.emit("connect", { sessionPresent: false })
    })
    expect([...next.subscribes[0].topics].sort()).toEqual(["chat/a", "chat/b", "chat/new-dm", "doc/d1"])
    unmount()
  })
})

// A page reads its conversations before the connection's subscriptions are
// answered (the engine starts at the first idle moment), so a message sent in
// between is in neither (FLUIDITY-LEAD-8's rtGap, 22 Oct 2026). The hook says
// when each connection's subscriptions are answered, for the page to read
// what came after its history, once.
describe("a connection's subscriptions", () => {
  it("are said to be answered once the broker answers them, once a connection", async () => {
    const onSubscribed = vi.fn()
    const hook = renderHook(() => useMqttConnection({ config: CONFIG, connectionConfig: CONNECTION, onSubscribed }))
    await after(100)
    const client = clients[clients.length - 1]
    act(() => {
      client.connected = true
      client.emit("connect", {})
    })
    expect(onSubscribed, "not before the broker answers").not.toHaveBeenCalled()
    answer(client.subscribes[0], [1, 1])
    expect(onSubscribed).toHaveBeenCalledTimes(1)
    act(() => hook.result.current.subscribeToTopic("doc/d1"))
    answer(client.subscribes[client.subscribes.length - 1], [1])
    expect(onSubscribed, "a later subscribe on the same connection is no catch-up").toHaveBeenCalledTimes(1)
    act(() => void client.emit("connect", {})) // connected again, as mqtt.js reconnects
    const again = client.subscribes[client.subscribes.length - 1]
    expect(again.topics).toContain("chat/a")
    answer(again, again.topics.map(() => 1))
    expect(onSubscribed, "every connection's own answer").toHaveBeenCalledTimes(2)
    hook.unmount()
  })

  it("are said to be answered when the broker refuses one of them: the rest are subscribed", async () => {
    const onSubscribed = vi.fn()
    const hook = renderHook(() => useMqttConnection({ config: CONFIG, connectionConfig: CONNECTION, onSubscribed }))
    await after(100)
    const client = clients[clients.length - 1]
    act(() => {
      client.connected = true
      client.emit("connect", {})
    })
    answer(client.subscribes[0], [1, 0x87])
    expect(onSubscribed).toHaveBeenCalledTimes(1)
    hook.unmount()
  })
})

// It stopped after ten tries, about three minutes, while the pill said
// "reconnecting": a broker restart that took longer left a visible tab dead.
describe("reconnecting", () => {
  it("never gives up: past the fast tries it tries every 30 s or so", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const { client, unmount } = await connectedWith(CONFIG)
    drop(client)
    // The fast tries: 1, 2, 4, 8 and 16 s, each failing.
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      const before = clients.length
      await after(wait + 100)
      expect(clients.length).toBe(before + 1)
      drop(clients[clients.length - 1])
    }
    // Then 30 s apart, long past where it used to stop.
    for (let i = 0; i < 12; i++) {
      const before = clients.length
      await after(29_000)
      expect(clients.length).toBe(before)
      await after(1_100)
      expect(clients.length).toBe(before + 1)
      drop(clients[clients.length - 1])
    }
    unmount()
  })

  it("tries at once when the network comes back, and only once", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const { client, unmount } = await connectedWith(CONFIG)
    drop(client)
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      await after(wait + 100)
      drop(clients[clients.length - 1])
    }
    const before = clients.length
    act(() => void window.dispatchEvent(new Event("online")))
    await after(100)
    expect(clients.length).toBe(before + 1)
    const now = clients[clients.length - 1]
    act(() => {
      now.connected = true
      now.emit("connect", {})
    })
    // The try that was waiting doesn't come along and take the session.
    await after(60_000)
    expect(clients.length).toBe(before + 1)
    unmount()
  })

  it("backs off again when a try asked for now fails, rather than hammering the broker", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const { client, result, unmount } = await connectedWith(CONFIG)
    drop(client)
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      await after(wait + 100)
      drop(clients[clients.length - 1])
    }
    const before = clients.length
    act(() => result.current.reconnect())
    // The broker is still down: every try fails at once, for ten seconds.
    const dropped = new Set<FakeClient>(clients)
    for (let t = 0; t < 10_000; t += 50) {
      await after(50)
      for (const c of clients) {
        if (!dropped.has(c)) {
          dropped.add(c)
          drop(c)
        }
      }
    }
    expect(clients.length - before).toBeGreaterThan(1)
    expect(clients.length - before).toBeLessThan(30)
    unmount()
  })

  it("can be asked to try now (the pill's Reconnect)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const { client, result, unmount } = await connectedWith(CONFIG)
    drop(client)
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      await after(wait + 100)
      drop(clients[clients.length - 1])
    }
    const before = clients.length
    act(() => result.current.reconnect())
    await after(100)
    expect(clients.length).toBe(before + 1)
    unmount()
  })
})

describe("a topic going live", () => {
  // A page reads what it shows before its topics are live, so what was sent
  // in between reached it neither way: each topic's first answer on a
  // connection tells the page to read again (F5, REGRESSION-HUNT 26 Oct).
  async function heard() {
    const live: string[] = []
    const hook = renderHook(() => useMqttConnection({ config: CONFIG, connectionConfig: CONNECTION, onTopicLive: (topic) => live.push(topic) }))
    await after(100)
    const client = clients[clients.length - 1]
    act(() => {
      client.connected = true
      client.emit("connect", {})
    })
    return { ...hook, client, live }
  }

  it("is told once the broker answers the topic, and again on each connection", async () => {
    const { result, client, live } = await heard()
    expect(live, "not before the broker answers").toEqual([])
    answer(client.subscribes[0], [0, 0])
    expect(live).toEqual(["chat/a", "chat/b"])
    expect(result.current.topicLiveAt("chat/a")).toBeTypeOf("number")
    act(() => void result.current.subscribeToTopic("chat/a"))
    answer(client.subscribes[1], [0])
    expect(live, "an answer for a topic already live says nothing").toEqual(["chat/a", "chat/b"])
    const asked = client.subscribes.length
    act(() => void client.emit("connect", {})) // connected again
    // The broker answers whatever the new connection asks for: the settings'
    // topics, and the page's own taken up again.
    for (const sub of client.subscribes.slice(asked)) answer(sub, sub.topics.map(() => 0))
    expect(live).toEqual(["chat/a", "chat/b", "chat/a", "chat/b"])
  })

  it("holds nothing live once the connection closes", async () => {
    const { result, client } = await heard()
    answer(client.subscribes[0], [0, 0])
    act(() => {
      client.connected = false
      client.emit("close")
    })
    expect(result.current.topicLiveAt("chat/a")).toBeUndefined()
  })

  it("isn't told about a topic the broker refused until it grants it", async () => {
    const { client, live } = await heard()
    answer(client.subscribes[0], [0x87, 0])
    expect(live).toEqual(["chat/b"])
    await after(5_000) // its first try again
    answer(client.subscribes[client.subscribes.length - 1], [0])
    expect(live).toEqual(["chat/b", "chat/a"])
  })

  it("is told again about a topic the page let go of and took up again", async () => {
    const { result, client, live } = await heard()
    answer(client.subscribes[0], [0, 0])
    act(() => void result.current.subscribeToTopic("doc/1"))
    answer(client.subscribes[1], [0])
    act(() => result.current.unsubscribeFromTopic("doc/1"))
    expect(result.current.topicLiveAt("doc/1"), "let go: no longer live").toBeUndefined()
    act(() => void result.current.subscribeToTopic("doc/1"))
    answer(client.subscribes[2], [0])
    expect(live).toEqual(["chat/a", "chat/b", "doc/1", "doc/1"])
  })

  it("isn't live when the page let go of it before the broker answered, and is told once taken up again", async () => {
    const { result, client, live } = await heard()
    answer(client.subscribes[0], [0, 0])
    // The page leaves within the round trip (a chip scrolled away, a doc
    // switched): live then, the topic would read as live before the next
    // page on it opened, and that page would never read again.
    act(() => void result.current.subscribeToTopic("doc/1"))
    act(() => result.current.unsubscribeFromTopic("doc/1"))
    answer(client.subscribes[1], [0])
    expect(result.current.topicLiveAt("doc/1"), "answered after the page let go: not live").toBeUndefined()
    act(() => void result.current.subscribeToTopic("doc/1"))
    answer(client.subscribes[2], [0])
    expect(live).toEqual(["chat/a", "chat/b", "doc/1"])
  })
})
