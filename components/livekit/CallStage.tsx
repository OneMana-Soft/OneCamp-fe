"use client"

// The call screen's own pieces, apart from LiveKit's (design v3, hub.md §7):
// the face for a camera that is off, the name plate and its level bars, the
// speaking ring, the place and recording pills, the mic meter, the captions,
// the Live pill and the connecting, reconnecting and left states. Kept out of
// VideoConference so they render (and are tested) without a room, and so a
// build without AI carries them too: nothing here imports from components/ai.
//
// The stage is always dark (VideoConference sets `dark`), so the camp tokens
// here resolve to their dark cuts.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useIsMuted, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import { ParticipantKind, Track } from "livekit-client"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { HUE_CLASS, avatarHueClass } from "@/components/ui/graphics/hues"
import { Captions, MicOff } from "@/lib/icons"
import { hueFor, type CampHue } from "@/lib/campHue"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { cn } from "@/lib/utils/helpers/cn"
import { prefersReducedMotion } from "@/lib/celebrate"
import { RING_OFF, formatElapsed, guestName, levelToBars, ringOpacity, type RingState } from "./callLevels"
import { captionsLabel, captionsWhereText, type CallTranscription } from "./callState"

/** Whether a tile shows a face rather than a picture: a camera with nothing to show. Pure. */
export function cameraIsOff(trackRef: Pick<TrackReferenceOrPlaceholder, "source" | "publication">, muted: boolean): boolean {
  return trackRef.source === Track.Source.Camera && (!trackRef.publication || muted)
}

/** An agent in a call is a LiveKit agent participant: drawn as the agent square, never a person. */
export function isAgentParticipant(p: { kind?: ParticipantKind } | undefined): boolean {
  return p?.kind === ParticipantKind.AGENT
}

/**
 * A face with no picture (C3, C5): the person's avatar gradient at 30% of the
 * tile's short side (56 to 120px), centred on a radial of their hue's dark
 * tint, with the name under it. An agent gets its square. The tile is a size
 * container, so the face scales with it.
 */
export function StageFace({
  identity,
  name,
  agent = false,
  showName = true,
  fixedSize,
  className,
}: {
  identity: string
  name: string
  agent?: boolean
  showName?: boolean
  /** A pixel size instead of the tile's 30% (the green room's 96). */
  fixedSize?: number
  className?: string
}) {
  const hue: CampHue = hueFor(identity)
  const size = fixedSize ? `${fixedSize}px` : "clamp(56px, 30cqmin, 120px)"
  const style = { width: size, height: size, fontSize: `calc(${size} * 0.375)` } as CSSProperties
  return (
    <div
      className={cn(
        HUE_CLASS[hue],
        "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5",
        agent
          ? "bg-[radial-gradient(60%_70%_at_50%_45%,var(--agent-muted),#16171A)]"
          : "bg-[radial-gradient(60%_70%_at_50%_45%,var(--hue-tint),#16171A)]",
        className,
      )}
      data-camera-off=""
      data-hue={agent ? "agent" : hue}
    >
      {agent ? (
        <span style={style} className="block" data-stage-agent="">
          <AgentAvatar />
        </span>
      ) : (
        <span style={style} aria-hidden className={cn(avatarHueClass(hue), "grid place-items-center rounded-full font-semibold leading-none")}>
          {getNameInitials(name)}
        </span>
      )}
      {showName ? <span className="max-w-[80%] truncate text-ui font-medium text-[#EEEEF0]">{name}</span> : null}
    </div>
  )
}

/**
 * A person whose camera is off, in their own colour, inside a LiveKit tile.
 * LiveKit's placeholder was the same grey silhouette for everybody.
 */
export function CameraOffFace({ trackRef, size = "md" }: { trackRef: TrackReferenceOrPlaceholder; size?: "sm" | "md" | "lg" }) {
  const muted = useIsMuted(trackRef)
  if (!cameraIsOff(trackRef, muted)) return null
  const who = trackRef.participant
  const { name } = guestName(who.identity || "", who.name || who.identity || "Guest")
  // A small tile's plate already says the name.
  return <StageFace identity={who.identity} name={name} agent={isAgentParticipant(who)} showName={size !== "sm"} />
}

/** Three mini bars on a name plate, from the level, each a beat behind the last: a voice's ripple. */
export function LevelBars({ level, className }: { level: number; className?: string }) {
  const reduced = typeof window !== "undefined" && prefersReducedMotion()
  const h = Math.min(1, Math.sqrt(Math.max(0, level)) * 1.6)
  return (
    <span aria-hidden className={cn("flex h-3 items-center gap-[1.5px]", className)} data-level-bars="">
      {[0.7, 1, 0.55].map((k, i) => (
        <i
          key={i}
          className="block h-3 w-[2.5px] origin-center rounded-[1px] bg-camp-moss transition-transform duration-[120ms] ease-out"
          style={{ transform: `scaleY(${reduced ? 0.5 : Math.max(0.25, h * k)})`, transitionDelay: `${i * 80}ms` }}
        />
      ))}
    </span>
  )
}

/**
 * The name plate (C5): bottom-left of a tile, a dark pill with the name, a
 * mic-off glyph when muted or level bars when speaking, a Guest or Agent tag,
 * and connection bars only when the connection is poor.
 */
export function NamePlate({
  name,
  muted = false,
  level = 0,
  speaking = false,
  guest = false,
  agent = false,
  poor = false,
  children,
  className,
}: {
  name: string
  muted?: boolean
  level?: number
  speaking?: boolean
  guest?: boolean
  agent?: boolean
  poor?: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      data-name-plate=""
      className={cn(
        "pointer-events-none absolute bottom-2 left-2 z-[2] flex h-6 max-w-[calc(100%-16px)] items-center gap-1.5 rounded-[12px] bg-[rgb(11_12_14/0.72)] px-2 text-meta font-medium text-[#EEEEF0]",
        className,
      )}
    >
      <span className="min-w-0 truncate">{name}</span>
      {guest ? <span className="inline-flex h-4 items-center rounded-[5px] bg-camp-sun-tint px-1.5 text-micro text-camp-sun-ink">Guest</span> : null}
      {agent ? <span className="inline-flex h-4 items-center rounded-[5px] bg-agent-muted px-1.5 text-micro text-agent-ink">Agent</span> : null}
      {muted ? <MicOff className="size-3 shrink-0 text-[#FF8086]" aria-label="Muted" /> : speaking ? <LevelBars level={level} /> : null}
      {poor ? (
        <span aria-label="Poor connection" className="flex h-2.5 items-end gap-px">
          {[4, 7, 10].map((px, i) => (
            <i key={px} className={cn("block w-0.5 rounded-[1px]", i === 0 ? "bg-warning-ink" : "bg-white/20")} style={{ height: px }} />
          ))}
        </span>
      ) : null}
      {children}
    </div>
  )
}

/**
 * The speaking ring (C6): an inset 2px ring in the person's hue whose opacity
 * follows their voice (ringOpacity), drawn on its own layer so only opacity
 * changes. No glow.
 */
export function SpeakingRing({ identity, opacity, agent = false }: { identity: string; opacity: number; agent?: boolean }) {
  const hue = hueFor(identity)
  return (
    <span
      aria-hidden
      data-speaking-ring=""
      data-hue={agent ? "agent" : hue}
      className={cn(
        !agent && HUE_CLASS[hue],
        "pointer-events-none absolute inset-0 z-[1] rounded-[14px] transition-opacity duration-[120ms] ease-out",
        agent ? "ring-2 ring-inset ring-agent" : "ring-2 ring-inset ring-hue",
      )}
      style={{ opacity }}
    />
  )
}

/**
 * The ring's opacity over time, from a level read up to 10 times a second.
 * The hold after the voice drops needs a clock, so it reads again once the
 * level has fallen silent.
 */
export function useRing(level: number): number {
  const [ring, setRing] = useState<RingState>(RING_OFF)
  const last = useRef(ring)
  useEffect(() => {
    const next = ringOpacity(level, last.current, { reduced: prefersReducedMotion() })
    last.current = next
    setRing(next)
    if (next.opacity > 0 && level === 0) {
      const t = window.setTimeout(() => {
        const after = ringOpacity(0, last.current, { reduced: prefersReducedMotion() })
        last.current = after
        setRing(after)
      }, 320)
      return () => window.clearTimeout(t)
    }
  }, [level])
  return ring.opacity
}

/**
 * The green room's 5-bar meter (C2), 20 x 14: bars 3px wide in the ok green,
 * lit by levelToBars. Reduced motion: one bar, on or off.
 */
export function MicMeter({ level, className }: { level: number; className?: string }) {
  const prev = useRef(0)
  const [bars, setBars] = useState(0)
  useEffect(() => {
    const next = levelToBars(level, prev.current)
    prev.current = next.level
    setBars(next.bars)
  }, [level])
  const reduced = typeof window !== "undefined" && prefersReducedMotion()
  return (
    <span aria-hidden data-mic-meter="" data-bars={bars} className={cn("flex h-3.5 w-5 items-end gap-px", className)}>
      {(reduced ? [0] : [0, 1, 2, 3, 4]).map((i) => (
        <i
          key={i}
          className="block h-3.5 w-[3px] origin-bottom rounded-[1px] bg-ok transition-transform duration-[120ms] ease-out"
          style={{ transform: `scaleY(${reduced ? (bars > 0 ? 1 : 0.15) : i < bars ? 1 : 0.15})` }}
        />
      ))}
    </span>
  )
}

/** The elapsed time since `since`, ticking every second. */
export function useElapsed(since: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [since])
  return since === null ? "" : formatElapsed(now - since)
}

const STAGE_PILL = "flex h-7 items-center gap-2 rounded-[14px] bg-[#1F2024] px-2.5 text-meta font-medium ring-1 ring-white/[0.09]"

/** "in #engineering" reads as a sentence elsewhere; a pill is a label. */
const placeLabel = (place?: string) => place?.replace(/^(in|with) /, "")

/** Top-left of the stage (C4): "#engineering · 24:10", the time tabular. */
export function PlacePill({ place, since }: { place?: string; since: number | null }) {
  const elapsed = useElapsed(since)
  const label = placeLabel(place)
  if (!label && !elapsed) return null
  return (
    <p className={cn(STAGE_PILL, "pointer-events-none absolute left-3 top-3 z-20 max-w-[50%] text-ink-2")} data-place-pill="">
      {label ? <span className="truncate">{label}</span> : null}
      {label && elapsed ? <span aria-hidden>·</span> : null}
      {elapsed ? <span className="tabular-nums text-[#EEEEF0]">{elapsed}</span> : null}
    </p>
  )
}

/**
 * Where the call's status pills sit (C8): top-centre beside nothing on a
 * wide stage; on a phone, top-right, clear of the place pill at the left
 * (the recording pill once sat over it there).
 */
export function CallStatusRow({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-[calc(50%-12px)] items-center justify-end gap-1.5 @3xl:right-auto @3xl:left-1/2 @3xl:max-w-none @3xl:-translate-x-1/2" data-call-status="">
      {children}
    </div>
  )
}

/**
 * Says the call is being recorded, and by whom, for as long as it is (C8): a
 * steady 8px danger dot and the words, announced once. Steady, never
 * pulsing. On a phone the pill keeps the dot and the time; who started it is
 * still read out.
 */
export function RecordingPill({ by, since }: { by: string | null; since?: number | null }) {
  const elapsed = useElapsed(since ?? null)
  return (
    <div role="status" className="min-w-0">
      <span className={cn(STAGE_PILL, "hub-pop-down text-[#EEEEF0]")} data-recording-pill="">
        <span className="size-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
        Recording{by ? <span className="sr-only @3xl:not-sr-only">{` · started by ${by}`}</span> : null}
        {elapsed ? <span className="tabular-nums text-ink-2">{elapsed}</span> : null}
      </span>
    </div>
  )
}

/**
 * Says captions are on, who turned them on and where everyone's speech goes
 * (CALL-BUG-2), for as long as they are on: a pill beside the recording's
 * that opens the details, and a member's choices: to stop their own voice
 * being captioned, or to turn captions off for everyone.
 */
export function CaptionsPill({
  transcription,
  captioningMe,
  onToggleMe,
  onTurnOff,
}: {
  transcription: CallTranscription
  /** Whether this person's own speech is being captioned; undefined where they have no choice (a guest). */
  captioningMe?: boolean
  onToggleMe?: () => void
  /** Turns captions off for everyone; a member's choice, never a guest's. */
  onTurnOff?: () => void
}) {
  const label = captionsLabel(transcription)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}. Where speech goes`}
          className={cn(STAGE_PILL, "hub-pop-down pointer-events-auto text-[#EEEEF0] transition-colors hover:bg-[#2A2B30] focus-visible:outline-2 focus-visible:outline-brand")}
          data-captions-pill=""
        >
          <Captions className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden truncate @3xl:inline">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" className="w-80 max-w-[calc(100vw-24px)] text-ui-sm" data-captions-details="">
        <p className="font-medium text-foreground">Captions are on</p>
        {transcription.by ? <p className="text-meta text-ink-3">Turned on by {transcription.by}</p> : null}
        <p className="mt-2 text-ink-2 text-pretty">{captionsWhereText(transcription)}</p>
        {captioningMe === false ? <p className="mt-2 text-ink-2">Your own speech isn&apos;t being captioned.</p> : null}
        {onToggleMe || onTurnOff ? (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {onToggleMe ? (
              <Button size="sm" variant="ghost" onClick={onToggleMe}>
                {captioningMe === false ? "Caption me again" : "Stop captioning me"}
              </Button>
            ) : null}
            {onTurnOff ? (
              <Button size="sm" variant="secondary" onClick={onTurnOff}>
                Turn off for everyone
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The first thing each person reads when captions come on (CALL-BUG-2): who
 * turned them on and where their own speech goes, before anything they say
 * is sent. It stays until they say they've read it; the pill keeps saying it
 * after that.
 */
export function CaptionsNotice({
  transcription,
  onDismiss,
  captioningMe,
  onToggleMe,
}: {
  transcription: CallTranscription
  onDismiss: () => void
  captioningMe?: boolean
  onToggleMe?: () => void
}) {
  return (
    <div
      role="status"
      className="hub-pop-down pointer-events-auto w-full max-w-[440px] rounded-[14px] bg-[#1F2024] p-3 text-ui-sm text-[#EEEEF0] shadow-e3 ring-1 ring-white/[0.09]"
      data-captions-notice=""
    >
      <p className="flex items-center gap-2 font-medium">
        <Captions className="size-4 shrink-0 text-[#A8ABB1]" aria-hidden />
        {transcription.by ? `${transcription.by} turned on captions` : "Captions are on"}
      </p>
      <p className="mt-1 text-[#A8ABB1] text-pretty">{captionsWhereText(transcription)}</p>
      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
        {onToggleMe && captioningMe !== false ? (
          <Button size="sm" variant="ghost" onClick={onToggleMe}>
            Stop captioning me
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  )
}

/** The Live pill lives beside the dot (no LiveKit in the sidebar's bundle); re-exported for the stage. */
export { LivePill } from "@/components/callIndicator/CallActiveIndicator"

export interface CaptionEntry {
  identity: string
  name: string
  text: string
}

/**
 * Live captions (C9): one dark block above the dock, each speaker's name in
 * their own colour over 18/26 text, two speakers and three lines at most.
 * Read out as they change.
 */
export function CaptionsOverlay({ entries, idleMessage }: { entries: CaptionEntry[]; idleMessage: string }) {
  const shown = entries.slice(-2)
  return (
    <div aria-live="polite" className="pointer-events-none absolute bottom-[84px] left-1/2 z-[var(--z-fixed)] w-full max-w-[720px] -translate-x-1/2 px-4">
      <div className="rounded-[12px] bg-[rgb(11_12_14/0.84)] px-3.5 py-2.5" data-captions="">
        {shown.length === 0 ? (
          <p className="text-ui text-ink-2">{idleMessage}</p>
        ) : (
          shown.map((e) => {
            const hue = hueFor(e.identity)
            return (
              <div key={e.identity} className="py-0.5">
                <span className={cn(HUE_CLASS[hue], "block text-meta font-semibold text-hue-ink")}>{e.name}</span>
                <span className="line-clamp-3 text-lg leading-[26px] text-[#EEEEF0]">
                  <TypingText text={e.text} />
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * New words type in quickly, so a caption grows as it is spoken; with reduced
 * motion they appear at once. A correction to what is already shown snaps.
 */
export function TypingText({ text = "" }: { text?: string }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (!text) return
    if (prefersReducedMotion() || !text.startsWith(shown) || text.length <= shown.length) {
      setShown(text)
      return
    }
    const delta = text.length - shown.length
    const step = Math.max(10, 40 - Math.min(30, delta * 2))
    const timer = setInterval(() => {
      setShown((prev) => {
        const next = text.slice(0, prev.length + 1)
        if (next.length >= text.length) clearInterval(timer)
        return next
      })
    }, step)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return <span>{shown}</span>
}

/**
 * How tall a call screen is that stands in for the stage: the green room,
 * connecting and left. On a call's own page it fills the window (the dynamic
 * viewport, so a phone's toolbar never crops it); beside other work it fills
 * its pane. Connecting and left once sized to their content on the call page,
 * a dark strip at the top of a white window.
 */
export function callScreenHeight(embedded?: boolean): string {
  return embedded ? "min-h-full" : "min-h-dvh"
}

/**
 * Connecting (C11): the ring motif, a gradient core with one dot circling it,
 * and where the call is. It replaced a generic spinner.
 */
export function CallConnecting({ place, embedded }: { place?: string; embedded?: boolean }) {
  const label = placeLabel(place)
  return (
    <div role="status" aria-label="Connecting to the call" className={cn("dark flex h-full w-full flex-col items-center justify-center gap-4 bg-[#0B0C0E]", callScreenHeight(embedded))} data-call-connecting="">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <defs>
          <linearGradient id="call-core" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF8A00" />
            <stop offset="1" stopColor="#FF3D00" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="20" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="9" fill="none" stroke="url(#call-core)" strokeWidth="4" />
        <g className="motion-safe:animate-[hub-orbit_1.2s_linear_infinite]" style={{ transformOrigin: "24px 24px" }}>
          <circle cx="24" cy="4" r="3" fill="var(--camp-sky)" />
        </g>
      </svg>
      <p className="text-ui text-ink-2">{label ? `Connecting to ${label}…` : "Connecting to the call…"}</p>
    </div>
  )
}

/**
 * You are reconnecting (C11): a sun-tint banner, top-centre. The stage dims
 * behind it. Inline, it takes its place in the stack under the pills, above
 * the captions notice.
 */
export function CallReconnecting({ inline = false }: { inline?: boolean }) {
  return (
    <div role="status" className={inline ? "pointer-events-none" : "pointer-events-none absolute left-1/2 top-12 z-30 -translate-x-1/2"}>
      <span className="hub-pop-down flex h-7 items-center rounded-[14px] bg-camp-sun-tint px-3 text-meta font-medium text-camp-sun-ink">Reconnecting…</span>
    </div>
  )
}

/**
 * After leaving (C11): how long, with whom, and the way back. The card says
 * where the recording will be when there is one.
 */
export function CallLeft({
  minutes,
  withWhom,
  onRejoin,
  onBack,
  backLabel,
  recorded = false,
  embedded,
}: {
  minutes?: number
  withWhom?: string
  onRejoin?: () => void
  onBack?: () => void
  backLabel?: string
  recorded?: boolean
  /** Beside other work (split view) rather than on the call's own page. */
  embedded?: boolean
}) {
  const parts = [minutes ? `${minutes} min` : "", withWhom ? `with ${withWhom}` : ""].filter(Boolean).join(" ")
  return (
    <div className={cn("dark flex h-full w-full items-center justify-center bg-[#0B0C0E] p-4 text-foreground", callScreenHeight(embedded))} data-call-left="">
      <div className="hub-pop w-[360px] max-w-full rounded-[16px] bg-[#1B1C1F] p-5 shadow-e4">
        <h2 className="text-title-3 font-semibold">You left the call</h2>
        {parts ? <p className="mt-1 text-ui text-ink-2">{parts}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {onRejoin ? <Button onClick={onRejoin}>Rejoin</Button> : null}
          {onBack ? (
            <Button variant="secondary" onClick={onBack}>
              {backLabel ?? "Back"}
            </Button>
          ) : null}
        </div>
        {recorded ? <p className="mt-3 text-meta text-ink-3">Recording will be ready in Recordings.</p> : null}
      </div>
    </div>
  )
}

/**
 * A call that ended without the person choosing to leave: removed (CALL-BUG-
 * 11), with no Rejoin, or never connected (CALL-BUG-23), with Try again. Why,
 * and the way on.
 */
export function CallRemoved({
  title,
  detail,
  onBack,
  backLabel,
  primary,
  kind = "removed",
  embedded,
}: {
  title: string
  detail: string
  onBack?: () => void
  backLabel?: string
  /** A way forward that isn't straight back into this call (Try again, a new meeting). */
  primary?: { label: string; onClick: () => void }
  kind?: "removed" | "failed" | "unavailable"
  embedded?: boolean
}) {
  return (
    <div className={cn("dark flex h-full w-full items-center justify-center bg-[#0B0C0E] p-4 text-foreground", callScreenHeight(embedded))} data-call-notice={kind}>
      <div role="alert" className="hub-pop w-[360px] max-w-full rounded-[16px] bg-[#1B1C1F] p-5 shadow-e4">
        <h2 className="text-title-3 font-semibold">{title}</h2>
        <p className="mt-1 text-ui text-ink-2 text-pretty">{detail}</p>
        {onBack || primary ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {primary ? <Button onClick={primary.onClick}>{primary.label}</Button> : null}
            {onBack ? (
              <Button variant="secondary" onClick={onBack}>
                {backLabel ?? "Back"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
