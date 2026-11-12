"use client"

import { use, useMemo } from "react"
import { MemberDoorView } from "@/components/livekit/MemberDoorView"

/** An event's own call room (gcal-15 head B), joined by whoever may: made ready the first time someone does. */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const door = useMemo(() => ({ event: id }), [id])
  return <MemberDoorView door={door} />
}
