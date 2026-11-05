"use client"

// A member's read of the call going on in a conversation or an instant
// meeting (Call State, GET /calls/current), for the green room and for what
// whoever runs the call does to it. One hook, so the channel, DM and group
// pages and the instant meeting's page read it alike.

import { useLiveCall } from "@/lib/calls/useLiveCall"
import type { CallRef } from "@/lib/calls/callRef"
import type { CallSessionRead } from "./callState"

/**
 * The call as its people read it (Call State): before joining, whether it is
 * recorded or captioned, and by whom, so the green room can say so before
 * Join (CALL-BUG-12), who is in it, and why it won't let you in now (locked,
 * or a host put you out); in it, the call's id, for what whoever runs it does
 * to it. Kept fresh while the green room is open, since a recording or a lock
 * can start while someone decides, and read again until the call's id is
 * known once you are in (the first person in opens the call as they connect).
 */
export function useCallSession(ref: CallRef | null, phase: "waiting" | "in-call" | "over"): CallSessionRead | undefined {
  const refreshInterval = (latest?: { data?: CallSessionRead }) =>
    phase === "waiting" ? 10_000 : phase === "in-call" && !latest?.data?.session?.id ? 2_000 : 0
  // The server says when this call changes (MESSAGE_CALL_STATE): useLiveCall
  // reads it again then, not at the next poll.
  return useLiveCall(ref, refreshInterval)
}
