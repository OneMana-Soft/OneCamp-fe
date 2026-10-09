import { describe, expect, it } from "vitest"
import { publicTrouble, retryAfterSeconds, retryDelayMs, sendFailedText } from "./publicApi"

describe("a failed public call", () => {
  it("is a dead link only when the server said so", () => {
    expect(publicTrouble(404)).toBe("gone")
    expect(publicTrouble(403)).toBe("gone")
    expect(publicTrouble(429)).toBe("busy")
    for (const status of [0, 500, 502, 503, 504]) expect(publicTrouble(status)).toBe("unreachable")
  })

  it("tells someone whose send failed whether to wait or what to fix", () => {
    expect(sendFailedText({ status: 429, msg: "Too many requests from here." })).toBe("Too many requests, wait a minute and try again.")
    expect(sendFailedText({ status: 503, msg: "The server couldn't answer just now." })).toMatch(/^Couldn't reach the server/)
    expect(sendFailedText({ status: 0, msg: "Couldn't reach the server. Check your connection and try again." })).toMatch(/^Couldn't reach the server/)
    expect(sendFailedText({ status: 400, msg: "Keep messages under 4,000 characters." })).toBe("Keep messages under 4,000 characters.")
  })
})

describe("asking again", () => {
  it("waits 5 seconds, doubling to a minute, spread a quarter either way", () => {
    const mid = () => 0.5
    expect([0, 1, 2, 3, 4, 9].map((n) => retryDelayMs(n, undefined, mid))).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000])
    expect(retryDelayMs(1, undefined, () => 0)).toBe(7_500)
    expect(retryDelayMs(1, undefined, () => 1)).toBe(12_500)
    expect(retryDelayMs(0, undefined, () => 0)).toBe(5_000) // never sooner than 5 s
    expect(retryDelayMs(6, undefined, () => 1)).toBe(60_000) // never later than a minute
  })

  it("never sooner than the server's Retry-After", () => {
    expect(retryDelayMs(0, 120, () => 0.5)).toBe(120_000)
    expect(retryDelayMs(3, 2, () => 0.5)).toBe(40_000)
  })

  it("reads Retry-After as seconds or as a date", () => {
    const now = Date.parse("2026-10-09T10:00:00Z")
    expect(retryAfterSeconds("30", now)).toBe(30)
    expect(retryAfterSeconds("Fri, 09 Oct 2026 10:02:00 GMT", now)).toBe(120)
    expect(retryAfterSeconds("soon", now)).toBeUndefined()
    expect(retryAfterSeconds(null, now)).toBeUndefined()
  })
})

