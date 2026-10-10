"use client"

// Record a clip: a voice note, a video of yourself, or your screen with your
// voice over it, up to five minutes (or the workspace's upload limit), then
// attach it to the message as a file. Slack and Teams both have clips; this
// one never leaves your server. Recording happens in the browser
// (MediaRecorder); nothing is sent until you attach and send it.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useClientConfig } from "@/hooks/useClientConfig"
import { CircleStop, Mic, MonitorUp, Pause, Play, RotateCcw, Video } from "@/lib/icons"
import {
  CLIP_BITRATES,
  CLIP_MAX_SECONDS,
  clipFileName,
  pickMimeType,
  secondsLeft,
  stopReason,
  type ClipKind,
} from "@/lib/clips/clip"
import { formatDuration } from "@/lib/utils/format/formatDuration"
import { cn } from "@/lib/utils/helpers/cn"

type Phase = "ready" | "starting" | "recording" | "paused" | "done" | "error"

const canRecord = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
const canShareScreen = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia

/** Asks for what the kind records: the microphone, the camera too, or a screen with the microphone over it. */
async function streamFor(kind: ClipKind): Promise<MediaStream> {
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true }
  if (kind === "voice") return navigator.mediaDevices.getUserMedia({ audio })
  if (kind === "video") {
    return navigator.mediaDevices.getUserMedia({ audio, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } })
  }
  const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false })
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio })
    return new MediaStream([...screen.getVideoTracks(), ...mic.getAudioTracks()])
  } catch {
    // No microphone, or it was refused: the screen on its own.
    return screen
  }
}

/** Why the browser said no, in words a person can act on. */
function problemOf(e: unknown, kind: ClipKind): string {
  const name = (e as { name?: string })?.name
  if (name === "NotAllowedError" || name === "SecurityError") {
    return kind === "screen"
      ? "Sharing your screen was cancelled or isn't allowed. Try again and pick a screen, window or tab."
      : `OneCamp needs your ${kind === "video" ? "camera and microphone" : "microphone"} to record. Allow them in your browser's site settings, then try again.`
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return kind === "video" ? "No camera was found. Connect one, or record a voice clip." : "No microphone was found. Connect one and try again."
  }
  return "Recording couldn't start in this browser."
}

export function ClipRecorder({ open, onOpenChange, onAttach }: { open: boolean; onOpenChange: (open: boolean) => void; onAttach: (file: File) => void }) {
  const { upload_limit_bytes: limit, upload_limit_mb: limitMb } = useClientConfig()
  const [kind, setKind] = React.useState<ClipKind>("voice")
  const [phase, setPhase] = React.useState<Phase>("ready")
  const [problem, setProblem] = React.useState("")
  const [stopped, setStopped] = React.useState<"time" | "size" | "screen" | null>(null)
  const [elapsed, setElapsed] = React.useState(0)
  const [bytes, setBytes] = React.useState(0)
  const [clip, setClip] = React.useState<{ url: string; file: File } | null>(null)

  const stream = React.useRef<MediaStream | null>(null)
  const recorder = React.useRef<MediaRecorder | null>(null)
  const chunks = React.useRef<Blob[]>([])
  const live = React.useRef<HTMLVideoElement | null>(null)
  // Recorded time is counted in slices, so a pause doesn't count.
  const clock = React.useRef({ banked: 0, since: 0 })

  const release = React.useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  const finish = React.useCallback((why: "time" | "size" | "screen" | null) => {
    setStopped(why)
    const r = recorder.current
    if (r && r.state !== "inactive") r.stop()
  }, [])

  // The clock: elapsed time, and the stop it may call for.
  React.useEffect(() => {
    if (phase !== "recording") return
    const tick = setInterval(() => {
      const now = clock.current.banked + (performance.now() - clock.current.since) / 1000
      setElapsed(now)
      const size = chunks.current.reduce((n, c) => n + c.size, 0)
      setBytes(size)
      const why = stopReason(now, size, limit)
      if (why) finish(why)
    }, 250)
    return () => clearInterval(tick)
  }, [phase, limit, finish])

  // Closing or leaving drops everything: no camera light left on, no file kept.
  const reset = React.useCallback(() => {
    const r = recorder.current
    if (r && r.state !== "inactive") {
      r.onstop = null
      r.stop()
    }
    recorder.current = null
    release()
    chunks.current = []
    setClip((c) => {
      if (c) URL.revokeObjectURL(c.url)
      return null
    })
    setPhase("ready")
    setProblem("")
    setStopped(null)
    setElapsed(0)
    setBytes(0)
  }, [release])

  React.useEffect(() => {
    if (!open) reset()
  }, [open, reset])
  React.useEffect(() => reset, [reset])

  const start = async () => {
    setPhase("starting")
    setProblem("")
    setStopped(null)
    const mimeType = pickMimeType(kind, (t) => MediaRecorder.isTypeSupported(t))
    try {
      const s = await streamFor(kind)
      stream.current = s
      if (live.current && kind !== "voice") {
        live.current.srcObject = s
        void live.current.play().catch(() => {})
      }
      // Stopping the share from the browser's own bar ends the clip.
      s.getVideoTracks().forEach((t) => (t.onended = () => finish("screen")))
      const r = new MediaRecorder(s, {
        mimeType,
        videoBitsPerSecond: CLIP_BITRATES[kind].video,
        audioBitsPerSecond: CLIP_BITRATES[kind].audio,
      })
      chunks.current = []
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      r.onstop = () => {
        release()
        const type = r.mimeType || mimeType || (kind === "voice" ? "audio/webm" : "video/webm")
        const blob = new Blob(chunks.current, { type })
        const file = new File([blob], clipFileName(kind, type, new Date()), { type })
        setClip({ url: URL.createObjectURL(blob), file })
        setBytes(blob.size)
        setPhase("done")
      }
      recorder.current = r
      clock.current = { banked: 0, since: performance.now() }
      setElapsed(0)
      setBytes(0)
      r.start(1000)
      setPhase("recording")
    } catch (e) {
      release()
      setProblem(problemOf(e, kind))
      setPhase("error")
    }
  }

  const pause = () => {
    const r = recorder.current
    if (!r || r.state !== "recording") return
    r.pause()
    clock.current.banked += (performance.now() - clock.current.since) / 1000
    setPhase("paused")
  }
  const resume = () => {
    const r = recorder.current
    if (!r || r.state !== "paused") return
    clock.current.since = performance.now()
    r.resume()
    setPhase("recording")
  }
  const again = () => {
    reset()
  }
  const attach = () => {
    if (!clip) return
    onAttach(clip.file)
    onOpenChange(false)
  }

  const supported = canRecord()
  const left = secondsLeft(elapsed, bytes, limit)
  const recordingNow = phase === "recording" || phase === "paused"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a clip</DialogTitle>
          <DialogDescription>
            Up to {CLIP_MAX_SECONDS / 60} minutes, or {limitMb} MB, your workspace&apos;s limit for a file. It&apos;s attached to your message; nothing is sent until you send it.
          </DialogDescription>
        </DialogHeader>

        {!supported ? (
          <p className="text-sm text-muted-foreground">This browser can&apos;t record clips. Try a current Chrome, Edge, Firefox or Safari.</p>
        ) : (
          <div className="grid gap-4">
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={(v) => v && setKind(v as ClipKind)}
              disabled={phase !== "ready" && phase !== "error"}
              className="justify-start"
              aria-label="What to record"
            >
              <ToggleGroupItem value="voice" className="gap-1.5 px-3">
                <Mic className="h-4 w-4" /> Voice
              </ToggleGroupItem>
              <ToggleGroupItem value="video" className="gap-1.5 px-3">
                <Video className="h-4 w-4" /> Video
              </ToggleGroupItem>
              {canShareScreen() && (
                <ToggleGroupItem value="screen" className="gap-1.5 px-3">
                  <MonitorUp className="h-4 w-4" /> Screen
                </ToggleGroupItem>
              )}
            </ToggleGroup>

            <div className={cn("relative overflow-hidden rounded-lg border bg-muted/40", kind === "voice" ? "h-28" : "aspect-video")}>
              {phase === "done" && clip ? (
                kind === "voice" ? (
                  <div className="flex h-full items-center justify-center px-4">
                    <audio src={clip.url} controls className="w-full" />
                  </div>
                ) : (
                  <video src={clip.url} controls playsInline className="h-full w-full bg-black object-contain" />
                )
              ) : kind === "voice" ? (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <span className={cn("flex h-12 w-12 items-center justify-center rounded-full", phase === "recording" ? "animate-pulse bg-destructive/15 text-danger-ink" : "bg-background text-muted-foreground")}>
                    <Mic className="h-6 w-6" />
                  </span>
                </div>
              ) : (
                <video ref={live} muted playsInline className="h-full w-full bg-black object-contain" />
              )}
              {recordingNow && (
                <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium tabular-nums" aria-live="polite">
                  <span className={cn("h-2 w-2 rounded-full", phase === "recording" ? "bg-destructive" : "bg-muted-foreground")} />
                  {phase === "paused" ? "Paused" : "Recording"} {formatDuration(elapsed)}
                </span>
              )}
            </div>

            <p className={cn("text-xs", phase === "error" ? "text-danger-ink" : "text-muted-foreground")} aria-live="polite">
              {phase === "error"
                ? problem
                : phase === "done"
                  ? stopped === "size"
                    ? `Stopped at ${formatDuration(elapsed)}: the clip reached the ${limitMb} MB limit for a file.`
                    : stopped === "time"
                      ? `Stopped at ${CLIP_MAX_SECONDS / 60} minutes, the longest a clip runs.`
                      : `${formatDuration(elapsed)} · ${(bytes / (1024 * 1024)).toFixed(1)} MB`
                  : recordingNow
                    ? `About ${formatDuration(left)} left`
                    : kind === "screen"
                      ? "You'll choose a screen, window or tab; your microphone records over it."
                      : kind === "video"
                        ? "Your camera and microphone record."
                        : "Your microphone records."}
            </p>
          </div>
        )}

        {supported && (
          <DialogFooter className="gap-2 sm:gap-2">
            {phase === "ready" || phase === "error" || phase === "starting" ? (
              <Button onClick={() => void start()} disabled={phase === "starting"} className="gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-current" aria-hidden />
                {phase === "starting" ? "Starting…" : "Start recording"}
              </Button>
            ) : recordingNow ? (
              <>
                {phase === "recording" ? (
                  <Button variant="outline" onClick={pause} className="gap-1.5">
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                ) : (
                  <Button variant="outline" onClick={resume} className="gap-1.5">
                    <Play className="h-4 w-4" /> Resume
                  </Button>
                )}
                <Button variant="destructive" onClick={() => finish(null)} className="gap-1.5">
                  <CircleStop className="h-4 w-4" /> Stop
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={again} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" /> Record again
                </Button>
                <Button onClick={attach} disabled={!clip}>
                  Attach clip
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ClipRecorder
