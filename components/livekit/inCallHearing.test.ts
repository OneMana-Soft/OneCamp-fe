import { describe, expect, it } from "vitest"
import { clockTime } from "@/lib/utils/date/clock"
import { hearingLine, hearingOf } from "./inCallHearing"

// The in-call assistant answers from the call's transcript only (CALLS-05).
// Its panel said "Listening" whatever it could hear: with the transcript off
// it heard nothing, and a late joiner's screen had heard only the lines since
// it came in. What it hears now: this screen's own lines from when it came in,
// or, in a call that keeps its transcript and had it on before this screen
// came in, the call's kept lines, which the server reads (UX-CALLS-H3).

const MIN = 60_000

describe("what the in-call assistant hears (UX-CALLS-H2)", () => {
  it("hears nothing while the transcript is off, and offers to turn it on only where it can be", () => {
    const turnOn = () => {}
    expect(hearingOf({ on: false }, Date.now(), turnOn)).toEqual({ on: false, onTurnOn: turnOn })
    expect(hearingOf({ on: false, since: Date.now() - MIN }, Date.now())).toEqual({ on: false })
  })

  it("hears this screen's lines from when it came in, or from when the transcript came on after that", () => {
    const cameIn = Date.now()
    // On a moment before this screen came in: it has heard it all.
    expect(hearingOf({ on: true, since: cameIn - 10_000, kept: true }, cameIn)).toEqual({ on: true, from: cameIn })
    expect(hearingOf({ on: true, since: cameIn + 5 * MIN, kept: true }, cameIn)).toEqual({ on: true, from: cameIn + 5 * MIN })
    // A server that doesn't say when: from when this screen came in.
    expect(hearingOf({ on: true, kept: true }, cameIn)).toEqual({ on: true, from: cameIn })
    // An instant meeting keeps nothing: a screen that came in late hears only from then.
    expect(hearingOf({ on: true, since: cameIn - 10 * MIN, kept: false }, cameIn)).toEqual({ on: true, from: cameIn })
  })

  it("reads the call's kept transcript from its start for a screen that came in after it began", () => {
    const cameIn = Date.now()
    const since = cameIn - 10 * MIN
    expect(hearingOf({ on: true, since, kept: true }, cameIn)).toEqual({ on: true, from: since, kept: true })
  })

  it("reads the kept transcript for a late screen when the server doesn't say whether the call keeps it", () => {
    // A server from before "kept" (or one that leaves it out) keeps the call's lines, browser captions too
    // (FrontendTranscriber persists its final lines): the late screen reads them, not only its own.
    const cameIn = Date.now()
    const since = cameIn - 10 * MIN
    expect(hearingOf({ on: true, since }, cameIn)).toEqual({ on: true, from: since, kept: true })
    // Not late: this screen heard it all, so it sends its own lines.
    expect(hearingOf({ on: true, since: cameIn - 10_000 }, cameIn)).toEqual({ on: true, from: cameIn })
  })

  it("says how long it has heard, or since when the call's transcript runs, and offers suggestions only after 30 seconds", () => {
    const now = Date.now()
    expect(hearingLine({ on: false, onTurnOn: () => {} }, now)).toEqual({ listening: false, state: "Not listening yet", detail: "", ready: false })
    expect(hearingLine({ on: false }, now)).toEqual({ listening: false, state: "Not listening", detail: "", ready: false })
    expect(hearingLine({ on: true, from: now - 5_000 }, now)).toEqual({ listening: true, state: "Listening", detail: "just started", ready: false })
    expect(hearingLine({ on: true, from: now - 4 * MIN }, now)).toEqual({ listening: true, state: "Listening", detail: "4 min heard", ready: true })
    expect(hearingLine({ on: true, from: now - 65 * MIN }, now).detail).toBe("1 h 5 min heard")
    // A clock ahead of this one's is just started, never a negative time.
    expect(hearingLine({ on: true, from: now + MIN }, now).detail).toBe("just started")
    const since = now - 12 * MIN
    expect(hearingLine({ on: true, from: since, kept: true }, now)).toEqual({ listening: true, state: "Listening", detail: `transcript on since ${clockTime(since)}`, ready: true })
  })
})
