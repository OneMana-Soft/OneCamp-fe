"use client"

import { useEffect, useState } from "react"
import { RoomEvent, type RemoteParticipant, type Room } from "livekit-client"
import { lightsDock, readActivitiesPacket } from "./callActivities"
import { CALL_TOPIC } from "./callState"
import { callToast } from "./callSurface"

/**
 * Whether the dock's Polls and Q&A says something new is there (calls package
 * A), while its panel is shut: lit by the server's word of a poll starting,
 * results shared, Q&A changing, or for whoever runs the call a question asked;
 * out once the panel opens. A poll starting is also said in a toast, as Zoom
 * and Meet put a new poll in front of everyone.
 */
export function useActivitiesLight(room: Room, open: boolean, runs: boolean): boolean {
  const [lit, setLit] = useState(false)
  useEffect(() => {
    if (open) {
      setLit(false)
      return
    }
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== CALL_TOPIC) return
      const told = readActivitiesPacket(payload, participant)
      if (!told || !lightsDock(told.what, runs)) return
      setLit(true)
      if (told.what === "poll") callToast({ title: "A poll just started", description: "Vote in Polls and Q&A.", tone: "info" })
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, open, runs])
  return lit
}
