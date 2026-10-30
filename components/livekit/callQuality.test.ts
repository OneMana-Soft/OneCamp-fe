import { afterEach, describe, expect, it, vi } from "vitest"

// Call Quality Telemetry's runner (calls A5, #56): the call's tracks read as
// one, and their samples sent as the person themselves.
const backendFetch = vi.fn(async (..._a: unknown[]) => new Response("{}", { status: 200 }))
vi.mock("@/lib/http/backendFetch", () => ({ backendFetch: (...a: unknown[]) => backendFetch(...a) }))
const publicCall = vi.fn(async (..._a: unknown[]) => ({ ok: true, data: { kept: 1 } }))
vi.mock("@/services/publicApi", () => ({ publicCall: (...a: unknown[]) => publicCall(...a) }))

import { QUALITY_EVERY_MS, QUALITY_SEND_EVERY } from "@/lib/calls/quality"
import { roomReader, watchQuality } from "./callQuality"

/** A track whose stats say what it has sent or received so far. */
const track = (sid: string, stats: Record<string, unknown>[]) => ({
  sid,
  getRTCStatsReport: async () => new Map(stats.map((s, i) => [String(i), { timestamp: Date.now(), ...s }])) as unknown as RTCStatsReport,
})
const pubs = (...ts: ReturnType<typeof track>[]) => new Map(ts.map((t) => [t.sid, { track: t }]))
const room = (local: ReturnType<typeof track>[], remote: ReturnType<typeof track>[][]) =>
  ({
    localParticipant: { trackPublications: pubs(...local) },
    remoteParticipants: new Map(remote.map((ts, i) => [`p${i}`, { trackPublications: pubs(...ts) }])),
  }) as never

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("reading the call's tracks", () => {
  it("adds up what you send and what you receive from everyone", async () => {
    const read = roomReader(
      room(
        [track("mic", [{ type: "outbound-rtp", kind: "audio", bytesSent: 100 }])],
        [[track("a", [{ type: "inbound-rtp", kind: "video", bytesReceived: 400, packetsReceived: 10 }])], [track("b", [{ type: "inbound-rtp", kind: "audio", bytesReceived: 50, packetsReceived: 5 }])]],
      ),
    )
    expect(await read()).toMatchObject({ sent: 100, received: 450, got: 15 })
  })

  it("keeps its totals going up when someone leaves, so a minute isn't read as nothing", async () => {
    const remote = [[track("a", [{ type: "inbound-rtp", kind: "video", bytesReceived: 400, packetsReceived: 10 }])], [track("b", [{ type: "inbound-rtp", kind: "video", bytesReceived: 900, packetsReceived: 30 }])]]
    const r = room([], remote) as unknown as { remoteParticipants: Map<string, unknown> }
    const read = roomReader(r as never)
    expect((await read())?.received).toBe(1_300)
    r.remoteParticipants.delete("p1")
    expect((await read())?.received).toBe(1_300)
  })

  it("reads nothing from a call with no tracks", async () => {
    expect(await roomReader(room([], []))()).toBeNull()
  })
})

describe("sending as the person themselves", () => {
  const busy = () =>
    room([track("cam", [{ type: "outbound-rtp", kind: "video", bytesSent: 0, framesPerSecond: 24 }])], [])

  it("sends a member's samples by their session, and the last ones on leaving to outlive the page", async () => {
    vi.useFakeTimers()
    const stop = watchQuality(busy(), { sessionId: "s1" })
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY)
    expect(backendFetch).toHaveBeenCalledTimes(1)
    const [path, init] = backendFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe("calls/s1/quality")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body)).samples).toHaveLength(QUALITY_SEND_EVERY)
    expect(init.keepalive).toBeFalsy()
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS)
    stop()
    expect((backendFetch.mock.calls[1] as unknown as [string, RequestInit])[1].keepalive).toBe(true)
    expect(publicCall).not.toHaveBeenCalled()
  })

  it("sends a guest's by their call token", async () => {
    vi.useFakeTimers()
    const stop = watchQuality(busy(), { callToken: "tok" })
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY)
    stop()
    const [path, init] = publicCall.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(path).toBe("/guest/calls/quality")
    expect(init.headers.Authorization).toBe("Bearer tok")
    expect(backendFetch).not.toHaveBeenCalled()
  })

  it("sends what the server didn't take again with the next, a member's and a guest's", async () => {
    vi.useFakeTimers()
    const sizes = (calls: unknown[][]) => calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).samples.length)
    backendFetch.mockResolvedValueOnce(new Response("{}", { status: 503 }))
    let stop = watchQuality(busy(), { sessionId: "s1" })
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY * 2)
    stop()
    expect(sizes(backendFetch.mock.calls)).toEqual([QUALITY_SEND_EVERY, QUALITY_SEND_EVERY * 2])
    publicCall.mockResolvedValueOnce({ ok: false, status: 0, msg: "Couldn't reach the server." } as never)
    stop = watchQuality(busy(), { callToken: "tok" })
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY * 2)
    stop()
    expect(sizes(publicCall.mock.calls)).toEqual([QUALITY_SEND_EVERY, QUALITY_SEND_EVERY * 2])
  })
})
