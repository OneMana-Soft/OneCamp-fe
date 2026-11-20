import { describe, expect, it } from "vitest"
import { momentLabel, momentQuery, readMoment, withoutMoment } from "@/lib/calls/callMoment"

const q = (s: string) => new URLSearchParams(s)

describe("a call's moment in a recording page's address (zoom-13)", () => {
  it("reads the recording, the moment and whether there is a picture", () => {
    expect(readMoment(q("play=EG_1&at=125400"))).toEqual({ recording: "EG_1", atMs: 125_400, media: true })
    expect(readMoment(q("play=CALL_9&at=9000&media=0"))).toEqual({ recording: "CALL_9", atMs: 9000, media: false })
  })

  it("opens a moment that isn't a time at the start, and nothing with no recording", () => {
    expect(readMoment(q("play=EG_1&at=-40"))?.atMs).toBe(0)
    expect(readMoment(q("play=EG_1&at=soon"))?.atMs).toBe(0)
    expect(readMoment(q("play=EG_1"))?.atMs).toBe(0)
    expect(readMoment(q("at=9000"))).toBeNull()
    expect(readMoment(q("play=%20&at=9000"))).toBeNull()
    expect(readMoment(null)).toBeNull()
  })

  it("writes what it reads", () => {
    for (const m of [{ recording: "EG_1", atMs: 125_400, media: true }, { recording: "CALL_9", atMs: 0, media: false }]) {
      expect(readMoment(q(momentQuery(m)))).toEqual(m)
    }
  })

  it("leaves the address without its moment, the rest of its query kept", () => {
    expect(withoutMoment("/app/channel/c1/recording", q("play=EG_1&at=9&media=0"))).toBe("/app/channel/c1/recording")
    expect(withoutMoment("/app/channel/c1/recording", q("play=EG_1&at=9&tab=all"))).toBe("/app/channel/c1/recording?tab=all")
  })

  it("says the moment as a clock: m:ss, and h:mm:ss from an hour", () => {
    expect(momentLabel(0)).toBe("0:00")
    expect(momentLabel(125_900)).toBe("2:05")
    expect(momentLabel(3_725_000)).toBe("1:02:05")
    expect(momentLabel(-5)).toBe("0:00")
  })
})
