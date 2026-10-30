"use client"

/**
 * One participant on the stage (hub.md C5, C6): the picture or their face,
 * the name plate, the speaking ring in their own hue and, on hover, the pin.
 * Built on LiveKit's ParticipantTile for its contexts and click handling, with
 * our own contents in place of LiveKit's defaults.
 */
import { useEffect, useState } from "react"
import {
  ParticipantTile,
  VideoTrack,
  useConnectionQualityIndicator,
  useEnsureTrackRef,
  useIsMuted,
  useIsSpeaking,
  type ParticipantClickEvent,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react"
import { ConnectionQuality, ParticipantKind, Track, type Participant } from "livekit-client"
import { Pin, PinOff } from "@/lib/icons"
import type { PersonAction } from "@/lib/calls/control"
import { cn } from "@/lib/utils/helpers/cn"
import dynamic from "next/dynamic"
import { useHandPlace } from "./handsQueue"

// A raised hand's badge: drawn once someone raises one, so not with the call.
const HandBadge = dynamic(() => import("./HandBadge").then((m) => m.HandBadge), { ssr: false })
import { NamePlate, SpeakingRing, StageFace, useRing } from "./CallStage"
import { guestName } from "./callLevels"
import { useTileWho } from "./callSelf"
import { PersonActionsMenu, useCallPart } from "./callHosting"

/** Whether a tile shows a face rather than a picture: a camera with nothing to show. Pure. */
export function cameraIsOff(trackRef: Pick<TrackReferenceOrPlaceholder, "source" | "publication">, muted: boolean): boolean {
  return trackRef.source === Track.Source.Camera && (!trackRef.publication || muted)
}

/** An agent in a call is a LiveKit agent participant: drawn as the agent square, never a person. */
export function isAgentParticipant(p: { kind?: ParticipantKind } | undefined): boolean {
  return p?.kind === ParticipantKind.AGENT
}

/**
 * A person whose camera is off, in their own colour, inside a LiveKit tile.
 * LiveKit's placeholder was the same grey silhouette for everybody.
 */
export function CameraOffFace({ trackRef, size = "md" }: { trackRef: TrackReferenceOrPlaceholder; size?: "sm" | "md" | "lg" }) {
  const muted = useIsMuted(trackRef)
  const who = trackRef.participant
  const shown = useTileWho(who)
  if (!cameraIsOff(trackRef, muted)) return null
  const { name } = guestName(shown.identity, shown.name || shown.identity || "Guest")
  // A small tile's plate already says the name.
  return <StageFace identity={shown.identity} name={name} agent={isAgentParticipant(who)} showName={size !== "sm"} />
}

/** A participant's audio level, read 10 times a second while they speak, else 0. */
export function useAudioLevel(participant: Participant, speaking: boolean): number {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!speaking) {
      setLevel(0)
      return
    }
    setLevel(participant.audioLevel ?? 0)
    const t = window.setInterval(() => setLevel(participant.audioLevel ?? 0), 100)
    return () => window.clearInterval(t)
  }, [participant, speaking])
  return level
}

export function StageTile({
  trackRef: given,
  onParticipantClick,
  pinned,
  onPin,
  size = "md",
  contain = false,
  actionsFor,
  onAction,
  className,
}: {
  trackRef?: TrackReferenceOrPlaceholder
  onParticipantClick?: (evt: ParticipantClickEvent) => void
  pinned?: boolean
  onPin?: () => void
  size?: "sm" | "md" | "lg"
  /** A shared screen fits the frame rather than filling it. */
  contain?: boolean
  /**
   * What whoever runs the call may do to this person (Call Control): a menu
   * on the tile, never on your own, an agent's or a shared screen.
   */
  actionsFor?: (participant: Participant) => PersonAction[]
  onAction?: (action: PersonAction, participant: Participant) => void
  className?: string
}) {
  const trackRef = useEnsureTrackRef(given)
  const who = trackRef.participant
  const mic = { participant: who, source: Track.Source.Microphone, publication: who.getTrackPublication?.(Track.Source.Microphone) } as TrackReferenceOrPlaceholder
  const micMuted = useIsMuted(mic)
  // The voice detector lags a microphone closing (push to talk let go), and
  // the mute is known at once: a closed microphone is never speaking.
  const speaking = useIsSpeaking(who) && !micMuted
  const level = useAudioLevel(who, speaking)
  const ring = useRing(speaking ? Math.max(level, 0.05) : 0)
  const camMuted = useIsMuted(trackRef)
  const { quality } = useConnectionQualityIndicator({ participant: who })
  const screen = trackRef.source === Track.Source.ScreenShare
  const handPlace = useHandPlace(who.identity)
  const showVideo = !!trackRef.publication && !cameraIsOff(trackRef, camMuted)
  // Your own part has no identity or name until the call connects: the call's token says both (callSelf).
  const shown = useTileWho(who)
  const { name, guest } = guestName(shown.identity, shown.name || shown.identity || "Guest")
  const agent = isAgentParticipant(who)
  // Someone let in by the call's invite, as the server names their part (calls HU13).
  const invited = useCallPart(who).role === "invitee"
  const reconnecting = quality === ConnectionQuality.Lost
  const actions = actionsFor && !who.isLocal && !agent && !screen ? actionsFor(who) : []

  return (
    <div
      data-flip-key={`${who.identity}|${trackRef.source}`}
      data-stage-tile=""
      className={cn(
        "group/tile relative h-full w-full overflow-hidden rounded-[14px] bg-[#16171A] ring-1 ring-inset ring-white/[0.06] [container-type:size] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-brand",
        reconnecting && "opacity-60",
        className,
      )}
    >
      <ParticipantTile trackRef={trackRef} onParticipantClick={onParticipantClick} className="!h-full !w-full !rounded-none !bg-transparent">
        {showVideo ? (
          <VideoTrack trackRef={trackRef as TrackReference} className={cn("h-full w-full", contain || screen ? "object-contain" : "object-cover")} />
        ) : null}
      </ParticipantTile>
      <CameraOffFace trackRef={trackRef} size={size} />
      {/* A 4% white overlay on hover. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-white/0 transition-colors group-hover/tile:bg-white/[0.04]" />
      {!screen ? <SpeakingRing identity={shown.identity} name={name} opacity={ring} agent={agent} /> : null}
      {handPlace !== null && !screen ? <HandBadge place={handPlace} className="absolute left-2 top-2 z-[3]" /> : null}
      <NamePlate
        name={screen ? `${name} is presenting` : name}
        muted={!screen && micMuted}
        speaking={!screen && speaking}
        level={level}
        guest={guest}
        agent={agent}
        invited={invited && !screen}
        poor={quality === ConnectionQuality.Poor}
      />
      {reconnecting ? (
        <span role="status" className="absolute inset-0 grid place-items-center text-ui-sm text-[#A8ABB1]">
          Reconnecting…
        </span>
      ) : null}
      {actions.length > 0 ? (
        // Beside the pin where there is one. Its own button, so pressing it
        // never also brings the tile to the stage.
        <span className={cn("absolute top-2 z-[3]", onPin ? "right-10" : "right-2")} onClick={(e) => e.stopPropagation()} data-tile-menu="">
          <PersonActionsMenu
            name={name}
            actions={actions}
            onSelect={(a) => onAction?.(a, who)}
            triggerClassName="grid size-7 place-items-center rounded-[8px] bg-[rgb(11_12_14/0.72)] text-[#EEEEF0] opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand group-hover/tile:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 [&_svg]:size-3.5"
          />
        </span>
      ) : null}
      {onPin ? (
        <button
          type="button"
          aria-label={pinned ? "Unpin" : "Pin to the stage"}
          aria-pressed={!!pinned}
          onClick={(e) => {
            e.stopPropagation()
            onPin()
          }}
          className={cn(
            "absolute right-2 top-2 z-[3] grid size-7 place-items-center rounded-[8px] bg-[rgb(11_12_14/0.72)] text-[#EEEEF0] transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-3.5",
            pinned ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          {pinned ? <PinOff /> : <Pin />}
        </button>
      ) : null}
    </div>
  )
}
