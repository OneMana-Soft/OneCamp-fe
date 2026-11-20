import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { consentOf, leaveAfter, recordConsent } from "./callConsent"

// zoom-09 C1: each person's OK or Leave on a recording or captions notice is
// kept by the server as an audit row of who agreed to what was on. One call,
// a member by their session, a guest by their call token (Asker); what was on
// is read from the room as they answer.

const meta = (o: object) => JSON.stringify(o)
const fetched = vi.fn()
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  fetched.mockReset()
})
const answering = (status: number | "offline") => {
  fetched.mockImplementation(() => (status === "offline" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(new Response("{}", { status }))))
  vi.stubGlobal("fetch", fetched)
}
const sent = () => {
  const [url, init] = fetched.mock.calls[0] as [string, RequestInit]
  return { url, init, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) }
}

describe("a notice's answer is kept as the person's own (zoom-09)", () => {
  it("names what the room shows as it is answered: the recording's egress id and the captions' session, else nothing", () => {
    expect(consentOf(meta({ isRecording: true, recordingStartedBy: "Maya", egressID: "EG_1", transcription: { on: true, since: 42 } }))).toEqual({ recording: "EG_1", transcript: 42 })
    // Before the recording's id lands, and with captions off.
    expect(consentOf(meta({ isRecording: true, recordingStartedBy: "Maya" }))).toEqual({ recording: "", transcript: 0 })
    expect(consentOf(meta({ transcription: { on: true, since: 7 } }))).toEqual({ recording: "", transcript: 7 })
    expect(consentOf("")).toEqual({ recording: "", transcript: 0 })
  })

  it("a member's goes to their session's call; a Leave outlives the page, an OK needn't", async () => {
    answering(200)
    expect(await recordConsent({ sessionId: "s 1" }, "accepted", meta({ isRecording: true, egressID: "EG_1" }))).toBe(true)
    const a = sent()
    expect(a.url).toMatch(/\/calls\/s%201\/consent$/)
    expect(a.init.method).toBe("POST")
    expect(a.body).toEqual({ choice: "accepted", recording: "EG_1", transcript: 0 })
    expect(a.init.keepalive).toBe(false)
    fetched.mockClear()
    await recordConsent({ sessionId: "s1" }, "left", meta({ isRecording: true, egressID: "EG_1" }))
    expect(sent().init.keepalive).toBe(true)
  })

  it("a guest's goes by the call token they joined with", async () => {
    answering(200)
    expect(await recordConsent({ callToken: "tok" }, "accepted", meta({ transcription: { on: true, since: 9 } }))).toBe(true)
    const g = sent()
    expect(g.url).toMatch(/\/guest\/calls\/consent$/)
    expect(g.headers.get("Authorization")).toBe("Bearer tok")
    expect(g.body).toEqual({ choice: "accepted", recording: "", transcript: 9 })
  })

  it("never throws: refused, stale or offline is false", async () => {
    for (const status of [409, 403, 500, "offline"] as const) {
      answering(status)
      await expect(recordConsent({ sessionId: "s1" }, "left", "")).resolves.toBe(false)
      await expect(recordConsent({ callToken: "tok" }, "accepted", "")).resolves.toBe(false)
    }
  })

  // A server that takes the connection and never answers: the wait is bounded
  // (8 s), and is false as offline is, so a guest's OK says to try again
  // instead of seeming to do nothing. Who asks makes no difference.
  it("stops waiting after 8 s: a server that never answers is false, as offline is", async () => {
    const stops: AbortController[] = []
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const stop = new AbortController()
      stops.push(stop)
      return stop.signal
    })
    onTestFinished(() => timeout.mockRestore())
    fetched.mockImplementation((_u: unknown, init: RequestInit) => new Promise((_, reject) => {
      const no = () => reject(new DOMException("The operation timed out.", "TimeoutError"))
      if (init.signal?.aborted) no()
      else init.signal?.addEventListener("abort", no)
    }))
    vi.stubGlobal("fetch", fetched)
    for (const [i, asker] of [{ sessionId: "s1" }, { callToken: "tok" }].entries()) {
      const kept = recordConsent(asker, "accepted", "")
      await vi.waitFor(() => expect(fetched).toHaveBeenCalledTimes(i + 1))
      expect(timeout).toHaveBeenLastCalledWith(8_000)
      expect((fetched.mock.lastCall![1] as RequestInit).signal).toBe(stops.at(-1)!.signal)
      stops.at(-1)!.abort()
      await expect(kept).resolves.toBe(false)
    }
  })

  it("Leave leaves once the answer is kept, or after 1.5 s at most, and only once", async () => {
    vi.useFakeTimers()
    const leave = vi.fn()
    let keep!: (v: boolean) => void
    leaveAfter(new Promise<boolean>((r) => (keep = r)), leave)
    await vi.advanceTimersByTimeAsync(100)
    expect(leave).not.toHaveBeenCalled()
    keep(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(leave).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(leave).toHaveBeenCalledTimes(1)

    const late = vi.fn()
    leaveAfter(new Promise(() => {}), late)
    await vi.advanceTimersByTimeAsync(1499)
    expect(late).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(late).toHaveBeenCalledTimes(1)
  })
})
