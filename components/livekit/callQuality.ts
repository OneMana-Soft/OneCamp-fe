// Call Quality Telemetry's runner (calls A5, #56): loaded once you are in the
// call (VideoConference), it reads the call's tracks every 10 s and sends
// their samples as you: a member by their session, a guest by the call token
// they joined with (Asker). The numbers and the cadence are lib/calls/quality's.

import type { Room } from "livekit-client"
import { mergeReadings, readStats, startQuality, type Reading, type SentSample } from "@/lib/calls/quality"
import { backendFetch } from "@/lib/http/backendFetch"
import { publicCall } from "@/services/publicApi"
import type { Asker } from "./handsRunner"

type StatsTrack = { sid?: string; getRTCStatsReport(): Promise<RTCStatsReport | undefined> }

/**
 * The call's tracks, yours and everyone's, read as one. A track that goes
 * (someone left, a camera turned off) leaves its counts behind, so the totals
 * only grow and the next sample isn't read as nothing.
 */
export function roomReader(room: Room): () => Promise<Reading | null> {
  const last = new Map<string, Reading>()
  const gone: Reading = { at: 0, sent: 0, received: 0, lost: 0, got: 0, jitter: 0, rtt: 0, fps: 0, freeze: 0, limited: "" }
  return async () => {
    const tracks: StatsTrack[] = []
    for (const p of room.localParticipant.trackPublications.values()) if (p.track) tracks.push(p.track)
    for (const who of room.remoteParticipants.values()) for (const p of who.trackPublications.values()) if (p.track) tracks.push(p.track)
    const now = new Map<string, Reading>()
    await Promise.all(
      tracks.map(async (t, i) => {
        // A track that ends while it's read (someone left, a camera went off)
        // has nothing left to say; what it sent until then is in `last`.
        const report = await t.getRTCStatsReport().catch(() => undefined)
        if (report) now.set(t.sid || `#${i}`, readStats(report))
      }),
    )
    for (const [sid, r] of last) {
      if (now.has(sid)) continue
      gone.sent += r.sent
      gone.received += r.received
      gone.lost += r.lost
      gone.got += r.got
      gone.freeze += r.freeze
      last.delete(sid)
    }
    for (const [sid, r] of now) last.set(sid, r)
    const merged = mergeReadings([...now.values()])
    if (!merged) return null
    return { ...merged, sent: merged.sent + gone.sent, received: merged.received + gone.received, lost: merged.lost + gone.lost, got: merged.got + gone.got, freeze: merged.freeze + gone.freeze }
  }
}

/**
 * Sends samples as the person themselves; the last ones on leaving outlive
 * the page. Fails when the server didn't take them, so they go again with
 * the next (startQuality).
 */
async function send(asker: Asker, samples: SentSample[], leaving: boolean): Promise<void> {
  const body = JSON.stringify({ samples })
  if ("sessionId" in asker) {
    const res = await backendFetch(`calls/${encodeURIComponent(asker.sessionId)}/quality`, { method: "POST", body, keepalive: leaving, headers: { "Content-Type": "application/json" } })
    if (!res.ok) throw new Error(`call quality not kept: ${res.status}`)
    return
  }
  const r = await publicCall("/guest/calls/quality", { method: "POST", body, keepalive: leaving, headers: { Authorization: `Bearer ${asker.callToken}` } })
  if (!r.ok) throw new Error(`call quality not kept: ${r.status}`)
}

type PressureRecord = { state: string }
type PressureObserverLike = { observe(source: "cpu", options?: { sampleInterval?: number }): Promise<void>; disconnect(): void }
type PressureObserverClass = new (callback: (records: PressureRecord[]) => void) => PressureObserverLike

/** Watches the call's quality and sends it; answers its stop. */
export function watchQuality(room: Room, asker: Asker): () => void {
  // The computer's pressure, where the browser says it (Compute Pressure).
  let cpu = ""
  const Pressure = (globalThis as { PressureObserver?: PressureObserverClass }).PressureObserver
  let pressure: PressureObserverLike | undefined
  if (Pressure) {
    try {
      pressure = new Pressure((records) => {
        cpu = records[records.length - 1]?.state ?? cpu
      })
      // A browser may refuse the CPU source (a permissions policy, or none on
      // this device): the samples then go without the computer's pressure.
      pressure.observe("cpu", { sampleInterval: 5_000 }).catch(() => {})
    } catch {
      pressure = undefined
    }
  }
  const stop = startQuality(roomReader(room), (samples, leaving) => send(asker, samples, leaving), () => cpu)
  return () => {
    stop()
    pressure?.disconnect()
  }
}
