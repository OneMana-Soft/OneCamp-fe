import { afterEach, describe, expect, it, vi } from "vitest"

import { QUALITY_EVERY_MS, QUALITY_MAX_BATCH, QUALITY_SEND_EVERY, mergeReadings, readStats, sampleOf, startQuality, type Reading } from "./quality"

// Call Quality Telemetry (calls A5, #56): the call's own stats, read every 10 s
// and sent about once a minute; what the server keeps is numbers in their
// ranges (business/CallQuality).

/** An RTCStatsReport as a browser gives one: a map of stats by id. */
const report = (...stats: Record<string, unknown>[]) => new Map(stats.map((s, i) => [String(i), s])) as unknown as RTCStatsReport

describe("reading a call's stats", () => {
  it("reads what was sent and received, lost, the round trip, jitter, frames, freezes and what held sending back", () => {
    const r = readStats(
      report(
        { type: "outbound-rtp", kind: "video", bytesSent: 1_000, framesPerSecond: 24, qualityLimitationReason: "cpu", timestamp: 5_000 },
        { type: "outbound-rtp", kind: "audio", bytesSent: 500, timestamp: 5_000 },
        { type: "inbound-rtp", kind: "video", bytesReceived: 2_000, packetsLost: 5, packetsReceived: 95, jitter: 0.012, totalFreezesDuration: 0.5, timestamp: 5_000 },
        { type: "inbound-rtp", kind: "audio", bytesReceived: 300, packetsLost: 1, packetsReceived: 49, jitter: 0.03, timestamp: 5_000 },
        { type: "candidate-pair", nominated: true, state: "succeeded", currentRoundTripTime: 0.08, timestamp: 5_000 },
        { type: "candidate-pair", nominated: false, state: "waiting", currentRoundTripTime: 2, timestamp: 5_000 },
      ),
    )
    expect(r).toEqual({ at: 5_000, sent: 1_500, received: 2_300, lost: 6, got: 144, jitter: 0.03, rtt: 0.08, fps: 24, freeze: 0.5, limited: "cpu" })
  })

  it("adds up the call's tracks: bytes and packets summed, the worst round trip and jitter, the camera's frames", () => {
    const a: Reading = { at: 5_000, sent: 1_000, received: 0, lost: 0, got: 0, jitter: 0, rtt: 0.05, fps: 24, freeze: 0, limited: "" }
    const b: Reading = { at: 5_010, sent: 0, received: 3_000, lost: 2, got: 98, jitter: 0.02, rtt: 0.09, fps: 0, freeze: 0.2, limited: "bandwidth" }
    expect(mergeReadings([a, b])).toEqual({ at: 5_010, sent: 1_000, received: 3_000, lost: 2, got: 98, jitter: 0.02, rtt: 0.09, fps: 24, freeze: 0.2, limited: "bandwidth" })
    expect(mergeReadings([])).toBeNull()
  })

  it("turns two readings ten seconds apart into one sample", () => {
    const before: Reading = { at: 0, sent: 0, received: 0, lost: 0, got: 0, jitter: 0, rtt: 0, fps: 0, freeze: 0, limited: "" }
    const after: Reading = { at: 10_000, sent: 1_250_000, received: 2_500_000, lost: 10, got: 990, jitter: 0.0154, rtt: 0.0826, fps: 23.6, freeze: 1.2, limited: "bandwidth" }
    expect(sampleOf(before, after, "fair")).toEqual({ rtt_ms: 83, jitter_ms: 15, loss_pct: 1, send_kbps: 1_000, recv_kbps: 2_000, fps: 24, freeze_ms: 1_200, limited: "bandwidth", cpu: "fair" })
  })

  it("makes nothing of counters that went back (a track replaced) or of no time", () => {
    const at10: Reading = { at: 10_000, sent: 9_000, received: 9_000, lost: 9, got: 900, jitter: 0, rtt: 0, fps: 0, freeze: 3, limited: "none" }
    const reset: Reading = { at: 20_000, sent: 100, received: 100, lost: 0, got: 10, jitter: 0, rtt: 0, fps: 0, freeze: 0, limited: "none" }
    expect(sampleOf(at10, reset, "")).toMatchObject({ send_kbps: 0, recv_kbps: 0, loss_pct: 0, freeze_ms: 0, limited: "" })
    expect(sampleOf(at10, at10, "")).toBeNull()
  })
})

describe("the call's quality on its way", () => {
  afterEach(() => vi.useRealTimers())

  it("reads every 10 s and sends about once a minute, each sample said by how long ago, and what's left on leaving", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let t = 0
    const read = vi.fn(async (): Promise<Reading> => {
      t += 10_000
      return { at: t, sent: t * 100, received: t * 200, lost: 0, got: t, jitter: 0.01, rtt: 0.05, fps: 24, freeze: 0, limited: "" }
    })
    const send = vi.fn(async () => {})
    const stop = startQuality(read, send, () => "")
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY)
    expect(send).toHaveBeenCalledTimes(1)
    const [batch, leaving] = send.mock.calls[0] as unknown as [{ ago_ms: number; send_kbps: number }[], boolean]
    expect(leaving).toBe(false)
    expect(batch).toHaveLength(QUALITY_SEND_EVERY)
    expect(batch.map((s) => s.ago_ms)).toEqual([50_000, 40_000, 30_000, 20_000, 10_000, 0])
    expect(batch[0].send_kbps).toBe(800)
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * 2)
    stop()
    expect(send).toHaveBeenCalledTimes(2)
    expect((send.mock.calls[1] as unknown as [unknown[], boolean])[1]).toBe(true)
    expect((send.mock.calls[1] as unknown as [unknown[]])[0]).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * 10)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("keeps going when a read or a send fails, and sends nothing it has nothing to send", async () => {
    vi.useFakeTimers()
    let t = 0
    const read = vi.fn(async (): Promise<Reading | null> => {
      t += 10_000
      if (t === 20_000) throw new Error("no stats")
      return t === 30_000 ? null : { at: t, sent: t, received: t, lost: 0, got: 1, jitter: 0, rtt: 0, fps: 0, freeze: 0, limited: "" }
    })
    const send = vi.fn(async () => {
      throw new Error("offline")
    })
    const stop = startQuality(read, send, () => "")
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * (QUALITY_SEND_EVERY + 4))
    expect(read.mock.calls.length).toBeGreaterThan(QUALITY_SEND_EVERY)
    expect(send).toHaveBeenCalled()
    stop()
    const quiet = vi.fn(async () => {})
    startQuality(async () => null, quiet, () => "")()
    expect(quiet).not.toHaveBeenCalled()
  })

  it("sends a batch that didn't get through again with the next, the newest two minutes at most", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    let t = 0
    const read = vi.fn(async (): Promise<Reading> => {
      t += 10_000
      return { at: t, sent: t, received: t, lost: 0, got: t, jitter: 0, rtt: 0, fps: 0, freeze: 0, limited: "" }
    })
    let offline = true
    const send = vi.fn(async (_samples: { ago_ms: number }[], _leaving: boolean) => {
      if (offline) throw new Error("offline")
    })
    const stop = startQuality(read, send, () => "")
    // Three minutes without a connection: each send carries what didn't go.
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY * 3)
    expect(send.mock.calls.map(([samples]) => samples.length)).toEqual([QUALITY_SEND_EVERY, QUALITY_MAX_BATCH, QUALITY_MAX_BATCH])
    offline = false
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY)
    // Said by how long ago each was taken, as of this send.
    expect(send.mock.calls[3][0].map((s) => s.ago_ms)).toEqual(Array.from({ length: QUALITY_MAX_BATCH }, (_, i) => (QUALITY_MAX_BATCH - 1 - i) * QUALITY_EVERY_MS))
    await vi.advanceTimersByTimeAsync(QUALITY_EVERY_MS * QUALITY_SEND_EVERY)
    expect(send.mock.calls[4][0]).toHaveLength(QUALITY_SEND_EVERY)
    stop()
  })
})
