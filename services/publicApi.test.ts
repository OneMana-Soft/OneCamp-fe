import { describe, expect, it } from "vitest"
import { publicTrouble, sendFailedText } from "./publicApi"

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
