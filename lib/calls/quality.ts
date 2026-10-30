// Call Quality Telemetry (calls A5, #56): what your own app sees of your
// connection in a call. Every 10 s it reads the call's stats, adds up its
// tracks into one reading, and turns two readings into one sample; about once
// a minute, and once more on leaving, it sends what it has. The server keeps
// numbers in their ranges and nothing else (business/CallQuality), and tells
// whoever runs the call why it stuttered for each person.

/** How often a reading is taken. */
export const QUALITY_EVERY_MS = 10_000
/** How many samples go in one send: about a minute's. */
export const QUALITY_SEND_EVERY = 6
/** The most one send carries: two minutes' worth, the server's MaxBatch. */
export const QUALITY_MAX_BATCH = 12

/** One reading of a call's counters, added up over its tracks. */
export type Reading = {
  /** When the stats were taken (their own clock, ms). */
  at: number
  /** Bytes sent and received so far. */
  sent: number
  received: number
  /** Packets lost and received so far. */
  lost: number
  got: number
  /** The worst jitter and round trip now, in seconds. */
  jitter: number
  rtt: number
  /** The camera's frames a second now. */
  fps: number
  /** Seconds of frozen video received so far. */
  freeze: number
  /** Why sending is held back, as the browser says: cpu, bandwidth, other, none or "". */
  limited: string
}

/** One sample, as the server takes it. */
export type QualitySample = {
  rtt_ms: number
  jitter_ms: number
  loss_pct: number
  send_kbps: number
  recv_kbps: number
  fps: number
  freeze_ms: number
  limited: string
  cpu: string
}

type Stat = Record<string, unknown> & { type?: string; kind?: string }
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** One stats report as a reading. Pure. */
export function readStats(report: RTCStatsReport): Reading {
  const r: Reading = { at: 0, sent: 0, received: 0, lost: 0, got: 0, jitter: 0, rtt: 0, fps: 0, freeze: 0, limited: "" }
  report.forEach((value) => {
    const s = value as Stat
    r.at = Math.max(r.at, num(s.timestamp))
    if (s.type === "outbound-rtp") {
      r.sent += num(s.bytesSent)
      if (s.kind === "video") {
        r.fps = Math.max(r.fps, num(s.framesPerSecond))
        if (typeof s.qualityLimitationReason === "string" && s.qualityLimitationReason !== "none") r.limited = s.qualityLimitationReason
      }
    } else if (s.type === "inbound-rtp") {
      r.received += num(s.bytesReceived)
      r.lost += Math.max(0, num(s.packetsLost))
      r.got += num(s.packetsReceived)
      r.jitter = Math.max(r.jitter, num(s.jitter))
      if (s.kind === "video") r.freeze += num(s.totalFreezesDuration)
    } else if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") {
      r.rtt = Math.max(r.rtt, num(s.currentRoundTripTime))
    }
  })
  return r
}

/** The readings of a call's tracks as one: counters summed, the worst now. Pure. */
export function mergeReadings(rs: readonly Reading[]): Reading | null {
  if (rs.length === 0) return null
  return rs.reduce((a, b) => ({
    at: Math.max(a.at, b.at),
    sent: a.sent + b.sent,
    received: a.received + b.received,
    lost: a.lost + b.lost,
    got: a.got + b.got,
    jitter: Math.max(a.jitter, b.jitter),
    rtt: Math.max(a.rtt, b.rtt),
    fps: Math.max(a.fps, b.fps),
    freeze: a.freeze + b.freeze,
    limited: a.limited || b.limited,
  }))
}

/**
 * The sample two readings make: rates over the time between them. A counter
 * that went back (a track replaced) counts as nothing; no time between them
 * makes no sample. Pure.
 */
export function sampleOf(before: Reading, after: Reading, cpu: string): QualitySample | null {
  const ms = after.at - before.at
  if (ms <= 0) return null
  const grew = (a: number, b: number) => Math.max(0, b - a)
  const lost = grew(before.lost, after.lost)
  const got = grew(before.got, after.got)
  const limited = after.limited === "none" ? "" : after.limited
  return {
    rtt_ms: Math.round(after.rtt * 1000),
    jitter_ms: Math.round(after.jitter * 1000),
    loss_pct: lost + got > 0 ? Math.round((lost / (lost + got)) * 1000) / 10 : 0,
    send_kbps: Math.round((grew(before.sent, after.sent) * 8) / ms),
    recv_kbps: Math.round((grew(before.received, after.received) * 8) / ms),
    fps: Math.round(after.fps),
    freeze_ms: Math.round(grew(before.freeze, after.freeze) * 1000),
    limited,
    cpu,
  }
}

/** A sample on its way: said by how long before its send it was taken. */
export type SentSample = QualitySample & { ago_ms: number }

/**
 * Reads every QUALITY_EVERY_MS and sends every QUALITY_SEND_EVERY samples,
 * and what is left when stopped (leaving). A read that fails is let go: the
 * next one goes on. A batch that doesn't get through goes again with the
 * next, the newest QUALITY_MAX_BATCH at most: a connection's worst minutes
 * are the likeliest to fail to send, and the server keeps one sample per
 * person per 10 s, so a batch whose answer was lost adds nothing the second
 * time. Answers its stop.
 */
export function startQuality(
  read: () => Promise<Reading | null>,
  send: (samples: SentSample[], leaving: boolean) => Promise<void>,
  cpu: () => string,
): () => void {
  let stopped = false
  let last: Reading | null = null
  // What waits to go, and how many of those were taken since the last send.
  let held: { sample: QualitySample; taken: number }[] = []
  let fresh = 0
  const flush = (leaving: boolean) => {
    if (held.length === 0) return
    const now = Date.now()
    const going = held.slice(-QUALITY_MAX_BATCH)
    held = []
    fresh = 0
    send(
      going.map(({ sample, taken }) => ({ ...sample, ago_ms: Math.max(0, now - taken) })),
      leaving,
    ).catch(() => {
      if (!stopped) held = [...going, ...held]
    })
  }
  const tick = async () => {
    let next: Reading | null = null
    try {
      next = await read()
    } catch {
      next = null
    }
    if (stopped || !next) return
    const sample = last ? sampleOf(last, next, cpu()) : null
    last = next
    if (sample) {
      held.push({ sample, taken: Date.now() })
      fresh++
    }
    if (fresh >= QUALITY_SEND_EVERY) flush(false)
  }
  void tick()
  const timer = setInterval(() => void tick(), QUALITY_EVERY_MS)
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    flush(true)
  }
}
