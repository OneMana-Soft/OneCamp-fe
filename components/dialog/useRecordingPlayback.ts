"use client"

// A recording's playback that outlives its link (CALL-BUG-10) and says when
// there is nothing to play (CALL-BUG-16).
//
// The player fetched a presigned link once, and it expired after five
// minutes: a long recording stopped when the browser asked for its next
// range, and every seek after that (a click on a transcript line included)
// failed. Now a media error, or a seek once the link is near its end, fetches
// a fresh link and carries on from the same moment, playing if it was.
//
// A failed or aborted recording used to open as a black frame with controls.
// The server now says which state a recording is in, and the player says it:
// one that captured nothing is "empty", not failed (V-32). A link the server
// refuses says why (loadError, lib/http/loadFailure): a recording this person
// can't see, or one that is gone, is no glitch a Try again can fix (V-1075).

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { loadFailure, type LoadFailure } from "@/lib/http/loadFailure"

export type RecordingStatus = "ready" | "failed" | "empty" | "recording" | "transcript_only"

export interface RecordingMedia {
  url?: string
  status: RecordingStatus
  /** When the link stops working, in ms; undefined when the server didn't say. */
  expiresAt?: number
}

const STATUSES: RecordingStatus[] = ["ready", "failed", "empty", "recording", "transcript_only"]

function readExpiry(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v) {
    const t = Date.parse(v)
    return Number.isNaN(t) ? undefined : t
  }
  return undefined
}

/**
 * The recording-URL answer, read. Older servers answered {url} or {data:
 * {url}} or {data: "<url>"}, with no status: a link is "ready". Pure.
 */
export function readRecordingMedia(body: unknown): RecordingMedia {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const d = b.data
  const inner = (d && typeof d === "object" ? d : {}) as Record<string, unknown>
  const url = [b.url, inner.url, typeof d === "string" ? d : undefined].find((u): u is string => typeof u === "string" && u.length > 0)
  const said = [b.status, inner.status].find((s): s is RecordingStatus => typeof s === "string" && (STATUSES as string[]).includes(s))
  const status: RecordingStatus = said ?? (url ? "ready" : "failed")
  return { url: status === "ready" ? url : undefined, status, expiresAt: readExpiry(b.expires_at ?? inner.expires_at) }
}

/** A link is treated as spent a minute early, so a seek never races its last second. Pure. */
export function linkSpent(media: Pick<RecordingMedia, "expiresAt"> | null, now = Date.now()): boolean {
  return !!media?.expiresAt && now >= media.expiresAt - 60_000
}

/** How many fresh links in a row before the player says it can't play. */
const MAX_RETRIES = 2

export function useRecordingPlayback(path: string, open: boolean, startAt?: number) {
  const [media, setMedia] = useState<RecordingMedia | null>(null)
  const [loadError, setLoadError] = useState<LoadFailure | false>(false)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  // Plays by itself when opened; after a fresh link, only if it was playing.
  const [autoPlay, setAutoPlay] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const seq = useRef(0)
  const retries = useRef(0)
  // The last read's refusal, for a download that asked for a fresh link (V-1102).
  const failed = useRef<LoadFailure | false>(false)
  const playing = useRef(false)
  const lastTime = useRef(0)
  // Where to carry on once the fresh link has loaded.
  const resume = useRef<{ time: number; play: boolean } | null>(null)

  const load = useCallback(async (): Promise<RecordingMedia | null> => {
    if (!path) return null
    const n = ++seq.current
    try {
      // @ts-expect-error — a background read: no loading bar
      const res = await axiosInstance.get(path, { ...OWN_ERRORS, silent: true })
      const next = readRecordingMedia(res.data)
      if (n === seq.current) {
        setMedia(next)
        setLoadError(false)
      }
      return next
    } catch (e) {
      // A recording this person can't see (403) or one that is gone (404) can't come back on a fresh link: the
      // picture goes, and the stage says why with no Try again (V-1075). Any other failure a retry can fix.
      const failure = loadFailure(e)
      failed.current = failure
      if (n === seq.current) {
        setLoadError(failure)
        if (failure !== "failed") setMedia(null)
      }
      return null
    }
  }, [path])

  useEffect(() => {
    if (!open) return
    setMedia(null)
    setLoadError(false)
    setPlaybackFailed(false)
    setAutoPlay(true)
    retries.current = 0
    // A call's moment (zoom-13, seconds): the media seeks there once it can, and plays.
    resume.current = startAt !== undefined && startAt > 0 ? { time: startAt, play: true } : null
    lastTime.current = 0
    void load()
  }, [open, load, startAt])

  /** A fresh link, then the same moment again; the same link is simply reloaded. */
  const refresh = useCallback(
    async (at: number, play: boolean) => {
      const before = media?.url
      setAutoPlay(false)
      resume.current = { time: at, play }
      const next = await load()
      if (next?.url && next.url === before) videoRef.current?.load()
    },
    [load, media?.url],
  )

  /** Plays from a moment (a transcript line), with a fresh link first when this one is spent. */
  const seekTo = useCallback(
    async (seconds: number) => {
      const v = videoRef.current
      if (!v) return
      const at = Math.max(0, seconds)
      if (linkSpent(media)) {
        await refresh(at, true)
        return
      }
      v.currentTime = at
      if (v.paused) void v.play().catch(() => undefined)
    },
    [media, refresh],
  )

  /** The link to download from, fresh when this one is spent; with none, why, as the stage reads it (V-1102). */
  const freshUrl = useCallback(async (): Promise<{ url?: string; failure: LoadFailure | false }> => {
    if (!linkSpent(media)) return { url: media?.url, failure: false }
    failed.current = false
    const next = await load()
    return next?.url ? { url: next.url, failure: false } : { failure: failed.current || "failed" }
  }, [media, load])

  const videoProps = {
    ref: videoRef,
    src: media?.status === "ready" ? media.url : undefined,
    autoPlay,
    onPlay: () => {
      playing.current = true
    },
    onPlaying: () => {
      retries.current = 0
    },
    onPause: () => {
      playing.current = false
    },
    onTimeUpdate: (e: SyntheticEvent<HTMLVideoElement>) => {
      lastTime.current = e.currentTarget.currentTime
    },
    onLoadedMetadata: (e: SyntheticEvent<HTMLVideoElement>) => {
      const r = resume.current
      if (!r) return
      resume.current = null
      e.currentTarget.currentTime = r.time
      if (r.play) void e.currentTarget.play().catch(() => undefined)
    },
    onError: (e: SyntheticEvent<HTMLVideoElement>) => {
      if (retries.current >= MAX_RETRIES) {
        setPlaybackFailed(true)
        return
      }
      retries.current += 1
      const at = e.currentTarget.currentTime || lastTime.current
      void refresh(at, playing.current)
    },
  }

  const retry = useCallback(() => {
    retries.current = 0
    setPlaybackFailed(false)
    void refresh(lastTime.current, true)
  }, [refresh])

  return { media, loadError, playbackFailed, videoRef, videoProps, seekTo, freshUrl, retry, reload: load }
}
