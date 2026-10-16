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
import { ConnectionQuality, Track, type Participant } from "livekit-client"
import { Ellipsis, Pin, PinOff, UserMinus } from "@/lib/icons"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils/helpers/cn"
import { CameraOffFace, NamePlate, SpeakingRing, cameraIsOff, isAgentParticipant, useRing } from "./CallStage"
import { guestName } from "./callLevels"

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
  onRemove,
  className,
}: {
  trackRef?: TrackReferenceOrPlaceholder
  onParticipantClick?: (evt: ParticipantClickEvent) => void
  pinned?: boolean
  onPin?: () => void
  size?: "sm" | "md" | "lg"
  /** A shared screen fits the frame rather than filling it. */
  contain?: boolean
  /** The host may remove this person (CALL-BUG-11): a menu on the tile, never on your own or an agent's. */
  onRemove?: (participant: Participant) => void
  className?: string
}) {
  const trackRef = useEnsureTrackRef(given)
  const who = trackRef.participant
  const speaking = useIsSpeaking(who)
  const level = useAudioLevel(who, speaking)
  const ring = useRing(speaking ? Math.max(level, 0.05) : 0)
  const mic = { participant: who, source: Track.Source.Microphone, publication: who.getTrackPublication?.(Track.Source.Microphone) } as TrackReferenceOrPlaceholder
  const micMuted = useIsMuted(mic)
  const camMuted = useIsMuted(trackRef)
  const { quality } = useConnectionQualityIndicator({ participant: who })
  const screen = trackRef.source === Track.Source.ScreenShare
  const showVideo = !!trackRef.publication && !cameraIsOff(trackRef, camMuted)
  const { name, guest } = guestName(who.identity || "", who.name || who.identity || "Guest")
  const agent = isAgentParticipant(who)
  const reconnecting = quality === ConnectionQuality.Lost
  const removable = !!onRemove && !who.isLocal && !agent && !screen

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
      {!screen ? <SpeakingRing identity={who.identity} name={name} opacity={ring} agent={agent} /> : null}
      <NamePlate
        name={screen ? `${name} is presenting` : name}
        muted={!screen && micMuted}
        speaking={!screen && speaking}
        level={level}
        guest={guest}
        agent={agent}
        poor={quality === ConnectionQuality.Poor}
      />
      {reconnecting ? (
        <span role="status" className="absolute inset-0 grid place-items-center text-ui-sm text-[#A8ABB1]">
          Reconnecting…
        </span>
      ) : null}
      {removable ? (
        // Beside the pin where there is one. Its own button, so pressing it
        // never also brings the tile to the stage.
        <span className={cn("absolute top-2 z-[3]", onPin ? "right-10" : "right-2")} onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More for ${name}`}
                className="grid size-7 place-items-center rounded-[8px] bg-[rgb(11_12_14/0.72)] text-[#EEEEF0] opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand group-hover/tile:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 [&_svg]:size-3.5"
                data-tile-menu=""
              >
                <Ellipsis />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onClick={() => onRemove?.(who)}>
                <UserMinus />
                Remove from call
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
