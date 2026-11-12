"use client"

// The caller's ring (slack-06 H2), on the stage while they are alone in the
// call: whom it rings, who declined and who didn't answer, and Ring again
// once every face has settled. The server says whom it rang ("ringing") and
// who declined, on the caller's own topic (lib/calls/ring); the clock says
// who didn't answer. The ring has a place of its own on the stage, where the
// one you call will be, and your tile keeps one beside it, as in a call of
// two (VideoConference; DESIGN-BUILD-118 F2: over your tile, your face showed
// past its card). A board or a share put up while it rings takes the stage,
// and the ring keeps the strip's first place (CallerRingPlace; V-779).

import { useEffect, useState, type CSSProperties } from "react"
import { Phone } from "lucide-react"
import { Clock, PhoneOff } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { ChatFace } from "@/components/message/chatFace"
import { RING_ON, RingFace } from "@/components/calls/RingFace"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { firstNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import { PLACE_FOCUS, STAGE_PLACE } from "./StageGrid"
import type { Size, StageKey } from "@/lib/calls/stageLayout"
import { CALL_RING_EVENT, callerReduce, facesAt, readRingMessage, ringRefusal, ringSummary, type CallerRing, type FaceState } from "@/lib/calls/ring"

const STATE_WORDS: Record<FaceState, string> = { ringing: "ringing", declined: "declined", no_answer: "didn't answer" }

/** The ring's place on the stage (stageLayout's key). */
export const RING_PLACE: StageKey = "ring:caller"

/** Your call's ring while it shows: none unless you are alone in the call (`inCall`, everyone in it, else null). */
export type CallerRingShown = { ring: CallerRing; faces: ReturnType<typeof facesAt>; said: string }

export function useCallerRing(sessionId: string | undefined, inCall: string[] | null): CallerRingShown | null {
  const [ring, setRing] = useState<CallerRing | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Only what changed, said politely: "Sam declined", "Maya didn't answer".
  const [said, setSaid] = useState("")

  useEffect(() => {
    const onRing = (e: Event) => {
      const msg = readRingMessage((e as CustomEvent).detail)
      if (!msg || (msg.state !== "ringing" && msg.state !== "declined")) return
      setRing((s) => callerReduce(s, msg))
      setNow(Date.now())
      if (msg.state === "declined" && msg.by) setSaid(`${firstNameOf(msg.by.name) || msg.by.name} declined`)
    }
    window.addEventListener(CALL_RING_EVENT, onRing)
    return () => window.removeEventListener(CALL_RING_EVENT, onRing)
  }, [])

  // At the ring's end, whoever still rang didn't answer: said once.
  useEffect(() => {
    if (!ring || !inCall) return
    const left = ring.until - Date.now()
    if (left <= 0) return
    const t = setTimeout(() => {
      const end = Date.now()
      setNow(end)
      const after = ringSummary(facesAt(ring, end, inCall))
      if (after.settled) setSaid(after.headline)
    }, left)
    return () => clearTimeout(t)
  }, [ring, inCall])

  const ours = inCall && ring && (!sessionId || ring.session === sessionId) ? ring : null
  const faces = ours ? facesAt(ours, now, inCall ?? []) : []
  return ours && faces.length ? { ring: ours, faces, said } : null
}

/** The ring's place: its faces, what it says, and Ring again once every face has settled. */
export default function CallerRinging({ shown: { ring: ours, faces, said } }: { shown: CallerRingShown }) {
  const [asking, setAsking] = useState(false)
  // A refusal belongs to the ring it was asked of: a new ring says nothing of it.
  const [refusal, setRefused] = useState({ until: 0, said: "" })
  const refused = refusal.until === ours.until ? refusal.said : ""
  const { headline, summary, settled } = ringSummary(faces)

  const ringAgain = async () => {
    setAsking(true)
    setRefused({ until: 0, said: "" })
    try {
      await axiosInstance.post(`/calls/${encodeURIComponent(ours.session)}/ring`, {}, OWN_ERRORS)
    } catch (err) {
      const r = (err as { response?: { status?: number; data?: { code?: string } } })?.response
      setRefused({ until: ours.until, said: ringRefusal(r?.status, r?.data?.code) || "Couldn't ring again. Try again." })
    } finally {
      setAsking(false)
    }
  }

  const one = faces.length === 1 ? faces[0] : null
  const size = one ? 64 : 36
  return (
    <div data-caller-ring={ours.session} className={cn(STAGE_PLACE, "flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-3 text-center")}>
      {/* As many a line as the place holds: five at 390 (DESIGN-BUILD-118 F3: a 168 px cap wrapped them 4 + 1). */}
      <ul className="flex flex-wrap justify-center gap-2" aria-label="Who the call rings">
          {faces.map((f) => {
            const ringing = f.state === "ringing"
            return (
              <li key={f.uuid} aria-label={`${f.name}, ${STATE_WORDS[f.state]}`} className="flex">
                <RingFace pulse={ringing} size={size}>
                  <ChatFace name={f.name} profileKey={f.profile} userUUID={f.uuid} size={size} className={ringing ? RING_ON : "opacity-60"} />
                  {!ringing && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full ring-2 ring-[#16171A] [&_svg]:size-2.5",
                        f.state === "declined" ? "bg-camp-berry text-white" : "bg-raised text-ink-2",
                      )}
                    >
                      {f.state === "declined" ? <PhoneOff /> : <Clock />}
                    </span>
                  )}
                </RingFace>
              </li>
            )
          })}
        </ul>
        <p className={cn("text-ui font-medium", one?.state === "declined" ? "text-camp-berry-ink" : one?.state === "no_answer" ? "text-ink-2" : "text-ink")}>{headline}</p>
        {summary && <p className="text-meta text-ink-3">{summary}</p>}
        {settled && (
          <Button variant="outline" size="sm" busy={asking} onClick={() => !asking && void ringAgain()}>
            <Phone aria-hidden="true" />
            Ring again
          </Button>
        )}
        {refused && <p className="text-meta text-danger-ink">{refused}</p>}
        <p aria-live="polite" className="sr-only">
          {said}
        </p>
    </div>
  )
}

/**
 * The ring's place in the strip while a board or a share holds the stage (V-779): its faces, still pulsing while they
 * ring, and what it says, at the strip's place size `tile`; a button that puts the ring back on the stage, where Ring
 * again is. What changes is said politely here too, as on the stage.
 */
export function CallerRingPlace({ shown: { faces, said }, tile, onShow, style }: { shown: CallerRingShown; tile: Size; onShow: () => void; style?: CSSProperties }) {
  const { headline } = ringSummary(faces)
  // A face and two lines of words in a phone's 85 px square, and two faces inside its padding (three overlapped made
  // 72 px of its 69: DESIGN-BUILD-127 F1d); a wide strip's place holds three bigger ones. The headline counts them all.
  const wide = tile.h >= 100
  const size = wide ? 40 : 28
  return (
    <div className="relative shrink-0" style={style}>
      <button
        type="button"
        aria-label={`Show the ring: ${headline}`}
        data-caller-ring-place=""
        data-strip-place={RING_PLACE}
        className={cn(
          STAGE_PLACE,
          "flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden p-2 text-center",
          PLACE_FOCUS,
        )}
        onClick={onShow}
      >
        <span aria-hidden="true" className="flex -space-x-1.5">
          {faces.slice(0, wide ? 3 : 2).map((f) => {
            const ringing = f.state === "ringing"
            return (
              <RingFace key={f.uuid} pulse={ringing} size={size}>
                <ChatFace name={f.name} profileKey={f.profile} userUUID={f.uuid} size={size} className={ringing ? RING_ON : "opacity-60"} />
              </RingFace>
            )
          })}
        </span>
        <span className="line-clamp-2 text-meta font-medium text-ink">{headline}</span>
      </button>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  )
}
