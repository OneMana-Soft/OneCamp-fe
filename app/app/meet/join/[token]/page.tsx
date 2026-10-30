"use client"

import { use, useMemo } from "react"
import { MemberDoorView } from "@/components/livekit/MemberDoorView"

/** A meeting's link or a call's invite, opened by someone in the workspace: in as themselves (calls HU13). */
export default function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const door = useMemo(() => ({ token }), [token])
  return <MemberDoorView door={door} />
}
