"use client"

// A person's tile on the stage (hub.md C5, C6), as the call and its recording
// both draw it (H3, meet-17): the picture or their face, the speaking ring in
// their own hue, the name plate with its marks (guest, agent, invited, muted,
// a poor connection), and a part that has lost its connection. The call's tile
// (StageTile) wraps it with its controls: LiveKit's ParticipantTile, the pin,
// Call Control's menu and a raised hand. The recording draws it bare. Its own
// module, so the recording's page brings the tile without the call's controls.

import { type ReactNode } from "react"
import { VideoTrack, useConnectionQualityIndicator, useIsMuted, type TrackReference, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import { ConnectionQuality, Track, type Participant } from "livekit-client"
import { stageKey } from "@/lib/calls/stageLayout"
import { cn } from "@/lib/utils/helpers/cn"
import { NamePlate, SpeakingRing, StageFace, useRing } from "./CallStage"
import { isAgentParticipant, useCallHues } from "./callHues"
import { guestName } from "./callLevels"
import { useTileWho } from "./callSelf"
import { cameraIsOff, useCallPart, useVoice } from "./stageTracks"
import { STAGE_PLACE } from "./StageGrid"

/** A face's and a plate's size: a strip's small places drop the face's name, as the plate says it. */
export type TileSize = "sm" | "md" | "lg"

/** Who a tile shows, as it names them: your own part has no identity or name until the call connects, and the call's token says both (callSelf). */
function useTileName(who: Participant) {
  const shown = useTileWho(who)
  const hueOf = useCallHues()
  const { name, guest } = guestName(shown.identity, shown.name || shown.identity || "Guest")
  return { identity: shown.identity, name, guest, hue: hueOf(shown.identity, name) }
}

/**
 * A person whose camera is off, in their colour in the call. LiveKit's
 * placeholder was the same grey silhouette for everybody. The tile's plate
 * names them, so the face's own name is for the eye only.
 */
export function CameraOffFace({ trackRef, size = "md" }: { trackRef: TrackReferenceOrPlaceholder; size?: TileSize }) {
  const muted = useIsMuted(trackRef)
  const { identity, name, hue } = useTileName(trackRef.participant)
  if (!cameraIsOff(trackRef, muted)) return null
  // A small tile's plate already says the name.
  return <StageFace identity={identity} name={name} hue={hue} agent={isAgentParticipant(trackRef.participant)} showName={size !== "sm"} plateNames />
}

/** What a tile's controls read of it. */
export interface TileOf {
  who: Participant
  name: string
  agent: boolean
  screen: boolean
}

export function TileBody({
  trackRef,
  size = "md",
  contain = false,
  picture = (video) => video,
  under,
  controls,
  className,
}: {
  trackRef: TrackReferenceOrPlaceholder
  size?: TileSize
  /** A shared screen fits the frame rather than filling it; the call's focus fits every picture. */
  contain?: boolean
  /** Where the picture goes: the call's tile puts it in LiveKit's ParticipantTile, for its contexts and clicks. */
  picture?: (video: ReactNode) => ReactNode
  /** Drawn over the picture and the face, under the ring and the plate: a hover's tint, a shared screen's ink. */
  under?: ReactNode
  /** Drawn over everything: the call's pin, menu and raised hand. */
  controls?: (tile: TileOf) => ReactNode
  className?: string
}) {
  const who = trackRef.participant
  const { micMuted, speaking, level } = useVoice(who)
  const ring = useRing(speaking ? Math.max(level, 0.05) : 0)
  const camMuted = useIsMuted(trackRef)
  const { quality } = useConnectionQualityIndicator({ participant: who })
  const screen = trackRef.source === Track.Source.ScreenShare
  const showVideo = !!trackRef.publication && !cameraIsOff(trackRef, camMuted)
  const { identity, name, guest, hue } = useTileName(who)
  const agent = isAgentParticipant(who)
  // Someone let in by the call's invite, as the server names their part (calls HU13).
  const invited = useCallPart(who).role === "invitee"
  const reconnecting = quality === ConnectionQuality.Lost

  return (
    <div
      data-flip-key={stageKey(who.identity, trackRef.source)}
      data-stage-tile=""
      className={cn(
        STAGE_PLACE,
        "relative h-full w-full overflow-hidden [container-type:size]",
        reconnecting && "opacity-60",
        className,
      )}
    >
      {picture(showVideo ? <VideoTrack trackRef={trackRef as TrackReference} className={cn("h-full w-full", contain || screen ? "object-contain" : "object-cover")} /> : null)}
      <CameraOffFace trackRef={trackRef} size={size} />
      {under}
      {!screen ? <SpeakingRing identity={identity} name={name} hue={hue} opacity={ring} agent={agent} /> : null}
      <NamePlate
        name={name}
        screen={screen}
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
      {controls?.({ who, name, agent, screen })}
    </div>
  )
}
