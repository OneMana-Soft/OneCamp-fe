import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RETRY_DELAYS_MS, RefusedTopicRetries, refusedTopics, retryDelay } from "./subscriptionRetry"

describe("retryDelay", () => {
  it("waits about 5 s, 15 s, 45 s and 2 minutes, then gives up", () => {
    expect([0, 1, 2, 3].map(retryDelay)).toEqual([5_000, 15_000, 45_000, 120_000])
    expect(retryDelay(4)).toBeNull()
    expect(retryDelay(-1)).toBeNull()
  })
})

describe("refusedTopics", () => {
  const asked = ["chat/a", "chat/b", "chat/c"]
  const subs = asked.map((topic) => ({ topic, qos: 1 }))

  it("reads which topics a SUBACK refused, as mqtt.js 5 reports it", () => {
    const err = new Error("Subscribe error: Not authorized")
    expect(refusedTopics(asked, err, subs, { granted: [1, 0x87, 0x80] })).toEqual(["chat/b", "chat/c"])
  })

  it("reads a refusal in a grant's qos, as older versions report it", () => {
    expect(refusedTopics(asked, null, [{ topic: "chat/a", qos: 1 }, { topic: "chat/b", qos: 128 }, { topic: "chat/c", qos: 0 }])).toEqual(["chat/b"])
  })

  it("takes every topic as refused for a bare Not authorized", () => {
    expect(refusedTopics(asked, new Error("Not authorized"))).toEqual(asked)
  })

  it("isn't a refusal when everything was granted, or the connection closed", () => {
    expect(refusedTopics(asked, null, subs, { granted: [1, 1, 0] })).toEqual([])
    expect(refusedTopics(asked, new Error("Connection closed"))).toEqual([])
    expect(refusedTopics(asked, new Error("client disconnecting"), subs)).toEqual([])
  })
})

describe("RefusedTopicRetries", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setUp() {
    const tried: string[] = []
    const gaveUp: [string, number][] = []
    const retries = new RefusedTopicRetries(
      (topic) => tried.push(topic),
      (topic, tries) => gaveUp.push([topic, tries]),
    )
    return { retries, tried, gaveUp }
  }

  it("tries a refused topic again after each delay, then gives it up", () => {
    const { retries, tried, gaveUp } = setUp()
    retries.refused("chat/a")
    for (const [i, delay] of RETRY_DELAYS_MS.entries()) {
      vi.advanceTimersByTime(delay - 1)
      expect(tried).toHaveLength(i)
      vi.advanceTimersByTime(1)
      expect(tried).toHaveLength(i + 1)
      retries.refused("chat/a") // refused again
    }
    expect(tried).toEqual(["chat/a", "chat/a", "chat/a", "chat/a"])
    expect(gaveUp).toEqual([["chat/a", 4]])
    expect(retries.pending()).toEqual([])
    vi.advanceTimersByTime(10 * 60_000)
    expect(tried).toHaveLength(4)
  })

  it("schedules one try at a time for a topic", () => {
    const { retries, tried } = setUp()
    retries.refused("chat/a")
    retries.refused("chat/a")
    vi.advanceTimersByTime(5_000)
    expect(tried).toEqual(["chat/a"])
  })

  it("starts a topic over once it's granted", () => {
    const { retries, tried } = setUp()
    retries.refused("chat/a")
    vi.advanceTimersByTime(5_000)
    retries.refused("chat/a") // the second wait is 15 s
    vi.advanceTimersByTime(15_000)
    expect(tried).toHaveLength(2)
    retries.subscribed("chat/a")
    retries.refused("chat/a") // refused again later: the first wait again
    vi.advanceTimersByTime(5_000)
    expect(tried).toHaveLength(3)
  })

  it("stops trying a topic that's forgotten, and everything on reset", () => {
    const { retries, tried } = setUp()
    retries.refused("chat/a")
    retries.refused("chat/b")
    retries.refused("chat/c")
    retries.forget("chat/a")
    expect(retries.pending().sort()).toEqual(["chat/b", "chat/c"])
    retries.reset()
    expect(retries.pending()).toEqual([])
    vi.advanceTimersByTime(10 * 60_000)
    expect(tried).toEqual([])
  })
})
