"use client"

// A call's polls and questions kept up to date while their panel is open
// (calls package A, "Ask the room"). The server tells every screen in the
// call that something changed and nothing more (callActivities), and each
// reads its own view again: one read at a time, at most one every READ_GAP_MS
// (the guests' read limit holds ten guests behind one address), and at once
// after your own action. A screen that missed a packet (a reconnect, a
// sleeping tab) reads on reconnecting, on coming back, and every SAFETY_MS.
// Loaded with the panel.

import { useCallback, useEffect, useRef, useState } from "react"
import { RoomEvent, type RemoteParticipant, type Room } from "livekit-client"
import type { Activity, CallActivities } from "@/lib/calls/activities"
import { doActivity, readActivities, type ActivityAnswer } from "@/services/callActivitiesService"
import type { Asker } from "./handsRunner"
import { readActivitiesPacket } from "./callActivities"
import { CALL_TOPIC } from "./callState"

export const READ_GAP_MS = 2_000
export const SAFETY_MS = 30_000

/** loading: the first read is out. ready: the activities are here. refused: they aren't open to this reader (out of the call, or it ended). */
export type ActivitiesStatus = "loading" | "ready" | "refused"

/** A trouble that passes, said, and read again at the next tick or on Try again. */
export type ActivitiesTrouble = "busy" | "unreachable" | null

/** Whose reads these are: a member's call, or a guest's call token. Pure. */
export const activitiesKey = (who: Asker) => ("sessionId" in who ? `s:${who.sessionId}` : `g:${who.callToken}`)

export function useCallActivities(who: Asker, room: Room) {
  const [activities, setActivities] = useState<CallActivities | null>(null)
  const [status, setStatus] = useState<ActivitiesStatus>("loading")
  const [trouble, setTrouble] = useState<ActivitiesTrouble>(null)
  const inflight = useRef(false)
  // A read asked while one is out: none, after the gap, or at once.
  const again = useRef<"no" | "gap" | "now">("no")
  const stopped = useRef(false)
  // A reader's reads only: an answer for the one before lands nowhere.
  const generation = useRef(0)
  const lastRead = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const whoRef = useRef(who)
  whoRef.current = who
  const key = activitiesKey(who)

  // now skips the gap: after your own action, or a Try again.
  const read = useCallback(async (now = false): Promise<void> => {
    if (stopped.current) return
    if (inflight.current) {
      if (now || again.current === "no") again.current = now ? "now" : "gap"
      return
    }
    const wait = lastRead.current + READ_GAP_MS - Date.now()
    if (!now && wait > 0) {
      if (timer.current === undefined) {
        timer.current = window.setTimeout(() => {
          timer.current = undefined
          void read()
        }, wait)
      }
      return
    }
    inflight.current = true
    lastRead.current = Date.now()
    const gen = generation.current
    try {
      const answer = await readActivities(whoRef.current)
      if (gen !== generation.current || stopped.current) return
      if (answer.kind === "read") {
        setActivities(answer.activities)
        setStatus("ready")
        setTrouble(null)
      } else if (answer.kind === "refused") {
        stopped.current = true
        setTrouble(null)
        setStatus("refused")
      } else {
        setTrouble(answer.kind)
      }
    } finally {
      if (gen === generation.current) {
        inflight.current = false
        const next = again.current
        again.current = "no"
        if (next !== "no" && !stopped.current) void read(next === "now")
      }
    }
  }, [])

  useEffect(() => {
    generation.current += 1
    stopped.current = false
    inflight.current = false
    again.current = "no"
    lastRead.current = 0
    setActivities(null)
    setStatus("loading")
    setTrouble(null)
    void read(true)
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic === CALL_TOPIC && readActivitiesPacket(payload, participant)) void read()
    }
    const back = () => {
      if (document.visibilityState === "visible") void read()
    }
    const reconnected = () => void read(true)
    room.on(RoomEvent.DataReceived, onData)
    room.on(RoomEvent.Reconnected, reconnected)
    document.addEventListener("visibilitychange", back)
    const safety = window.setInterval(back, SAFETY_MS)
    return () => {
      stopped.current = true
      room.off(RoomEvent.DataReceived, onData)
      room.off(RoomEvent.Reconnected, reconnected)
      document.removeEventListener("visibilitychange", back)
      window.clearInterval(safety)
      window.clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [key, room, read])

  /**
   * Does one thing, then reads at once: what you did shows without waiting
   * for its packet, which joins this read; a refusal reads what changed.
   */
  const act = useCallback(
    async (a: Activity): Promise<ActivityAnswer> => {
      const answer = await doActivity(whoRef.current, a)
      void read(true)
      return answer
    },
    [read],
  )

  const retry = useCallback(() => void read(true), [read])

  return { activities, status, trouble, act, retry }
}
