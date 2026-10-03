"use client"

/**
 * useVoiceDictation — a generic voice-to-text primitive reused by every text
 * surface (message composer, AI assistant, …). The caller decides what to do
 * with the transcript (append, replace, send).
 *
 * Two engines, picked once on mount:
 *  - "desktop": the OneCamp desktop app records and transcribes on the person's
 *    own computer (lib/desktopDictation). Works with no speech engine on the
 *    server and the audio never leaves the machine. The first use downloads the
 *    model, so `setup` reports that and its progress.
 *  - "server": records a clip with MediaRecorder and sends it to POST
 *    /ai/transcribe, the model-agnostic engine also used for call transcription.
 *    Only offered when the workspace has a REST-capable speech engine.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { getVoiceInputAvailable, transcribeAudio } from "@/services/aiService"
import {
  desktopDictation,
  desktopDictationStatus,
  downloadPercent,
  type DesktopDictationStatus,
} from "@/lib/desktopDictation"

interface UseVoiceDictationOptions {
  /** Receives the transcript when a recording is transcribed. */
  onText: (text: string) => void
  /** Optional error hook (e.g. mic permission denied, transcription failed). */
  onError?: (message: string) => void
}

export type DictationEngine = "desktop" | "server"

export interface DictationSetup {
  /** The desktop engine still has to download its model before first use. */
  needed: boolean
  /** Megabytes the download costs, when known. */
  sizeMb: number | null
  /** 0–100 while downloading, else null. */
  progress: number | null
}

const POLL_MS = 700

export function useVoiceDictation({ onText, onError }: UseVoiceDictationOptions) {
  const [engine, setEngine] = useState<DictationEngine | null>(null)
  const [desktop, setDesktop] = useState<DesktopDictationStatus | null>(null)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const engineRef = useRef<DictationEngine | null>(null)
  const recordingRef = useRef(false)
  engineRef.current = engine
  recordingRef.current = recording

  // Latest callbacks without re-creating start/stop on every render.
  const onTextRef = useRef(onText)
  const onErrorRef = useRef(onError)
  onTextRef.current = onText
  onErrorRef.current = onError

  // Follows a model download until it ends.
  const follow = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current)
    pollRef.current = setTimeout(async () => {
      const status = await desktopDictationStatus()
      if (!status) return
      setDesktop(status)
      if (status.state === "downloading") follow()
      else if (status.state === "failed") onErrorRef.current?.(status.message)
    }, POLL_MS)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const status = await desktopDictationStatus()
      if (cancelled) return
      if (status && status.state !== "unsupported") {
        setDesktop(status)
        setEngine("desktop")
        // Another surface may have started the download: keep following it.
        if (status.state === "downloading") follow()
        return
      }
      // An Intel Mac, or not the desktop app: the server engine, if there is one.
      if ((await getVoiceInputAvailable()) && !cancelled) setEngine("server")
    })()
    return () => {
      cancelled = true
    }
  }, [follow])

  // Never leave a microphone open behind an unmounted surface.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
      const rec = recorderRef.current
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop()
        } catch {
          /* noop */
        }
      }
      if (engineRef.current === "desktop" && recordingRef.current) void desktopDictation.cancel().catch(() => {})
    }
  }, [])

  const deliver = useCallback((text: string) => {
    const t = text.trim()
    if (t) onTextRef.current(t)
    else onErrorRef.current?.("Didn't catch that. Try again.")
  }, [])

  const startServer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
        chunksRef.current = []
        if (blob.size === 0) return
        setTranscribing(true)
        try {
          deliver(await transcribeAudio(blob, "clip.webm"))
        } catch {
          onErrorRef.current?.("Transcription failed.")
        } finally {
          setTranscribing(false)
        }
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      onErrorRef.current?.("Microphone unavailable. Allow mic access to dictate.")
    }
  }, [deliver])

  const start = useCallback(async () => {
    if (engine === "server") return startServer()
    if (engine !== "desktop" || desktop?.state === "downloading") return
    if (desktop?.state !== "ready") {
      // First use: fetch the model, then the person presses again to speak.
      try {
        await desktopDictation.install()
        setDesktop({ state: "downloading", done: 0, total: 0 })
        follow()
      } catch (e) {
        onErrorRef.current?.((e as Error).message)
      }
      return
    }
    try {
      await desktopDictation.start()
      setRecording(true)
    } catch (e) {
      onErrorRef.current?.((e as Error).message)
    }
  }, [engine, desktop, follow, startServer])

  const stop = useCallback(async () => {
    setRecording(false)
    if (engine === "server") {
      const rec = recorderRef.current
      if (rec && rec.state !== "inactive") rec.stop()
      return
    }
    if (engine !== "desktop") return
    setTranscribing(true)
    try {
      deliver(await desktopDictation.stop())
    } catch (e) {
      onErrorRef.current?.((e as Error).message)
    } finally {
      setTranscribing(false)
    }
  }, [engine, deliver])

  const toggle = useCallback(() => {
    if (recording) void stop()
    else void start()
  }, [recording, start, stop])

  const setup: DictationSetup = {
    needed: engine === "desktop" && desktop?.state !== "ready" && desktop?.state !== "recording",
    sizeMb: desktop && "download_mb" in desktop ? desktop.download_mb : null,
    progress: downloadPercent(desktop),
  }

  return { available: engine !== null, engine, setup, recording, transcribing, start, stop, toggle }
}

/** What a dictation control says right now. Shared so every surface agrees. */
export function dictationLabel(d: { recording: boolean; transcribing: boolean; setup: DictationSetup }): string {
  if (d.transcribing) return "Transcribing…"
  if (d.recording) return "Stop & insert"
  if (d.setup.progress !== null) return `Downloading speech model… ${d.setup.progress}%`
  if (d.setup.needed) {
    return d.setup.sizeMb ? `Set up dictation (${d.setup.sizeMb} MB, runs on this computer)` : "Set up dictation"
  }
  return "Dictate"
}
