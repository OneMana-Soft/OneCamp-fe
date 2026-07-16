"use client"

/**
 * useVoiceDictation — a generic voice-to-text primitive reused by any text
 * surface (message composer, AI assistant, …). It probes whether the workspace
 * has a REST-capable STT configured (the model-agnostic engine also used for
 * call transcription), records a clip via MediaRecorder, transcribes it through
 * POST /ai/transcribe, and hands the text back via onText. Fully decoupled: the
 * caller decides what to do with the transcript (append, replace, send).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { getVoiceInputAvailable, transcribeAudio } from "@/services/aiService"

interface UseVoiceDictationOptions {
  /** Receives the transcript when a recording is transcribed. */
  onText: (text: string) => void
  /** Optional error hook (e.g. mic permission denied, transcription failed). */
  onError?: (message: string) => void
}

export function useVoiceDictation({ onText, onError }: UseVoiceDictationOptions) {
  const [available, setAvailable] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    let cancelled = false
    getVoiceInputAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Stop tracks + recorder on unmount so a mic is never left open.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop()
        } catch {
          /* noop */
        }
      }
    }
  }, [])

  const start = useCallback(async () => {
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
          const text = (await transcribeAudio(blob, "clip.webm")).trim()
          if (text) onText(text)
          else onError?.("Didn't catch that — try again.")
        } catch {
          onError?.("Transcription failed.")
        } finally {
          setTranscribing(false)
        }
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      onError?.("Microphone unavailable — allow mic access to dictate.")
    }
  }, [onText, onError])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== "inactive") rec.stop()
    setRecording(false)
  }, [])

  const toggle = useCallback(() => {
    if (recording) stop()
    else void start()
  }, [recording, start, stop])

  return { available, recording, transcribing, start, stop, toggle }
}
