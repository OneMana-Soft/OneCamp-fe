"use client"

// Record a clip: a voice note, a video of yourself, or your screen with your
// voice over it, up to five minutes (or the workspace's upload limit), then
// attach it to the message as a file. Slack and Teams both have clips; this
// one never leaves your server. Recording happens in the browser
// (MediaRecorder); nothing is sent until you attach and send it.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

  // The voice meter: three berry rings that scale with the microphone's
  // level, written straight to a CSS variable so the level never re-renders
  // the dialog. Transform only; still with reduced motion.
  const meter = React.useRef<HTMLSpanElement | null>(null)
  React.useEffect(() => {
    if (phase !== "recording" || kind !== "voice" || !stream.current) return
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const ctx = new AC()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    const source = ctx.createMediaStreamSource(stream.current)
    source.connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let raf = 0
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += ((v - 128) / 128) ** 2
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4)
      meter.current?.style.setProperty("--level", level.toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      source.disconnect()
      void ctx.close()
      meter.current?.style.setProperty("--level", "0")
    }
  }, [phase, kind])

  const kinds: { value: ClipKind; label: string; Icon: typeof Mic }[] = [
    { value: "voice", label: "Voice", Icon: Mic },
    { value: "video", label: "Video", Icon: Video },
    ...(canShareScreen() ? [{ value: "screen" as const, label: "Screen", Icon: MonitorUp }] : []),
  ]
  const at = Math.max(0, kinds.findIndex((k) => k.value === kind))
  const locked = phase !== "ready" && phase !== "error"
  // How far through what it may hold: by time or by size, whichever is nearer.
  const progress = recordingNow || phase === "done" ? Math.min(1, elapsed / Math.max(1, elapsed + left)) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-clip-dialog="" className="bg-pop shadow-e4 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-heading text-ink">Record a clip</DialogTitle>
          <DialogDescription className="text-ui-sm text-ink-2">
            Up to {CLIP_MAX_SECONDS / 60} minutes, or {limitMb} MB, your workspace&apos;s limit for a file. It&apos;s attached to your message; nothing is sent until you send it.
          </DialogDescription>
        </DialogHeader>

        {!supported ? (
          <p className="text-ui-sm text-ink-2">This browser can&apos;t record clips. Try a current Chrome, Edge, Firefox or Safari.</p>
        ) : (
          <div className="grid gap-3">
            {/* What to record (C56): a segmented control whose raised chip
                slides under the choice by transform, never by width. */}
            <div
              role="radiogroup"
              aria-label="What to record"
              data-clip-kinds=""
              className="relative grid h-9 w-fit rounded-[10px] bg-sunken p-0.5"
              style={{ gridTemplateColumns: `repeat(${kinds.length}, 6.5rem)` }}
            >
              <span
                aria-hidden="true"
                data-clip-chip=""
                className="absolute inset-y-0.5 left-0.5 w-[6.5rem] rounded-lg bg-raised shadow-e1 transition-transform duration-[180ms] ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(${at * 100}%)` }}
              />
              {kinds.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  disabled={locked}
                  onClick={() => setKind(value)}
                  className={cn(
                    "relative flex items-center justify-center gap-1.5 rounded-lg text-ui-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
                    kind === value ? "text-ink" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            {/* One stage for Voice, Video and Screen: a 16:9 frame, r12 on the
                sunken ground, so switching never resizes the centred dialog. */}
            <div data-clip-stage="" className="relative aspect-video overflow-hidden rounded-xl bg-sunken">
              {phase === "done" && clip ? (
                kind === "voice" ? (
                  <div className="flex h-full items-center justify-center px-4">
                    <audio src={clip.url} controls className="w-full" />
                  </div>
                ) : (
                  <video src={clip.url} controls playsInline className="h-full w-full bg-black object-contain" />
                )
              ) : kind === "voice" ? (
                <div className="hue-berry flex h-full items-center justify-center">
                  <span ref={meter} data-voice-meter="" className="relative flex size-14 items-center justify-center rounded-full [--level:0]">
                    {[1.9, 1.55, 1.25].map((k, i) => (
                      <span
                        key={i}
                        aria-hidden="true"
                        className={cn("absolute inset-0 rounded-[inherit] bg-hue transition-transform duration-75 ease-out", phase === "recording" ? "opacity-[.14]" : "opacity-0")}
                        style={{ transform: `scale(calc(1 + var(--level) * ${k - 1}))` }}
                      />
                    ))}
                    <span className={cn("relative flex size-14 items-center justify-center rounded-[inherit]", phase === "recording" ? "bg-hue text-white" : "bg-raised text-ink-3 shadow-e1")}>
                      <Mic className="size-6" />
                    </span>
                  </span>
                </div>
              ) : (
                <video ref={live} muted playsInline className="h-full w-full bg-black object-contain" />
              )}
              {recordingNow && (
                <span data-clip-timer="" className="absolute left-2.5 top-2.5 flex h-6 items-center gap-1.5 rounded-md bg-black/60 px-2 text-micro font-medium tabular-nums text-white" aria-live="polite">
                  <span className={cn("size-1.5 rounded-full", phase === "recording" ? "bg-camp-berry" : "bg-white/60")} />
                  {phase === "paused" ? "Paused" : "Recording"} {formatDuration(elapsed)}
                </span>
              )}
              {/* How much of the clip's room is used: a 2px berry line. */}
              <span aria-hidden="true" className="hue-berry absolute inset-x-0 bottom-0 h-0.5">
                <span data-clip-progress="" className="absolute inset-0 origin-left bg-hue transition-transform duration-200 ease-linear" style={{ transform: `scaleX(${progress})` }} />
              </span>
            </div>

            {/* Two lines' room: Screen's hint wraps where the others don't. */}
            <p data-clip-hint="" className={cn("min-h-8 text-meta", phase === "error" ? "text-danger-ink" : "text-ink-3")} aria-live="polite">
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
          <DialogFooter data-clip-footer={phase} className="gap-2 sm:gap-2">
            {phase === "ready" || phase === "error" || phase === "starting" ? (
              <Button onClick={() => void start()} disabled={phase === "starting"} className="gap-1.5">
                <span className="size-2 rounded-full bg-current" aria-hidden />
                {phase === "starting" ? "Starting…" : "Start recording"}
              </Button>
            ) : recordingNow ? (
              <>
                {phase === "recording" ? (
                  <Button variant="outline" onClick={pause} className="gap-1.5">
                    <Pause className="size-4" /> Pause
                  </Button>
                ) : (
                  <Button variant="outline" onClick={resume} className="gap-1.5">
                    <Play className="size-4" /> Resume
                  </Button>
                )}
                <Button variant="destructive" onClick={() => finish(null)} className="gap-1.5">
                  <CircleStop className="size-4" /> Stop
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={again} className="gap-1.5">
                  <RotateCcw className="size-4" /> Record again
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
