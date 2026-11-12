"use client"

import { useEffect } from "react"
import { joinEnded, takeAccepted } from "@/lib/calls/accepting"
import type { CallLifecycle } from "@/components/livekit/useCallLifecycle"

/**
 * Accept on a ring, at its call's door (slack-06 H2): joins the call once,
 * with the microphone on and the camera off, and says when that join is over
 * (lib/calls/accepting), for the ring's card to go: the prejoin alone says how
 * it went. The call view loads it only while an Accept is at its door
 * (lib/calls/acceptJoin), so a call page's first load carries none of it.
 */
export default function AcceptJoin({ door, life: { phase, join } }: { door: string; life: CallLifecycle }) {
  useEffect(() => {
    if (phase !== "prejoin") return
    if (takeAccepted(door)) join({ audioEnabled: true, videoEnabled: false })
    // Back at the prejoin after its join: refused, and the prejoin says why.
    else joinEnded(door)
  }, [door, phase, join])
  // In the call, or the door closed.
  useEffect(() => () => joinEnded(door), [door])
  return null
}
