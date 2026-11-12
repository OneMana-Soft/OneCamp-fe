"use client"

// What the stage reads from the room, for the call's stage and its recording
// (H3, meet-17): the call's state from the room's metadata, who speaks, a
// person's voice for their plate and ring, their part in the call, and a
// camera with nothing to show. Its own module, so the recording's page brings
// these without the call's.

import { useEffect, useState } from "react"
import { useIsMuted, useIsSpeaking, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import { ParticipantEvent, RoomEvent, Track, type Participant, type Room } from "livekit-client"
import { NO_PART, partOf, type CallPart } from "@/lib/calls/control"
import { readCallMetadata, type CallMetadata } from "./callState"

/** The call's state, from the room's metadata (the server writes it): whether it is recorded, captioned, locked, and who is in the spotlight. */
export function useCallMetadata(room: Room): CallMetadata {
  const [meta, setMeta] = useState(() => readCallMetadata(room.metadata))
  useEffect(() => {
    const update = () => setMeta(readCallMetadata(room.metadata))
    update()
    // This mounts before the room connects, and a join brings what the call
    // already holds (a recording, captions, a lock) with no change event:
    // livekit-client sets the room's metadata from the join's answer, then
    // says Connected.
    room.on(RoomEvent.Connected, update)
    room.on(RoomEvent.RoomMetadataChanged, update)
    return () => {
      room.off(RoomEvent.Connected, update)
      room.off(RoomEvent.RoomMetadataChanged, update)
    }
  }, [room])
  return meta
}

/** Who speaks, for the stage: a speaking camera first, else anyone speaking, held 800 ms before it changes so the focus doesn't jitter. */
export function useStageSpeaker(tracks: TrackReferenceOrPlaceholder[]): TrackReferenceOrPlaceholder | null {
  const [speaker, setSpeaker] = useState<TrackReferenceOrPlaceholder | null>(null)
  useEffect(() => {
    // Who speaks now (instant).
    const now = tracks.find((t) => t.participant.isSpeaking && t.source === Track.Source.Camera) || tracks.find((t) => t.participant.isSpeaking)
    if (now?.participant.identity !== speaker?.participant.identity) {
      const timer = setTimeout(() => setSpeaker(now || null), 800)
      return () => clearTimeout(timer)
    }
  }, [tracks, speaker])
  return speaker
}

/** Whether a tile shows a face rather than a picture: a camera with nothing to show. Pure. */
export function cameraIsOff(trackRef: Pick<TrackReferenceOrPlaceholder, "source" | "publication">, muted: boolean): boolean {
  return trackRef.source === Track.Source.Camera && (!trackRef.publication || muted)
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

/** A person's voice, for their plate and ring: muted, speaking, and how loud. */
export function useVoice(who: Participant): { micMuted: boolean; speaking: boolean; level: number } {
  const mic = { participant: who, source: Track.Source.Microphone, publication: who.getTrackPublication?.(Track.Source.Microphone) } as TrackReferenceOrPlaceholder
  const micMuted = useIsMuted(mic)
  // The voice detector lags a microphone closing (push to talk let go), and
  // the mute is known at once: a closed microphone is never speaking.
  const speaking = useIsSpeaking(who) && !micMuted
  const level = useAudioLevel(who, speaking)
  return { micMuted, speaking, level }
}

/** Someone's part in the call, kept current as the server changes it. */
export function useCallPart(participant: Participant | undefined): CallPart {
  const [part, setPart] = useState<CallPart>(() => (participant ? partOf(participant.attributes) : NO_PART))
  useEffect(() => {
    if (!participant) return
    const update = () => setPart(partOf(participant.attributes))
    update()
    participant.on(ParticipantEvent.AttributesChanged, update)
    return () => {
      participant.off(ParticipantEvent.AttributesChanged, update)
    }
  }, [participant])
  return part
}
