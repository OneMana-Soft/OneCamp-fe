"use client"

import { use } from "react"
import { CallView } from "@/components/livekit/CallView"
import { useLeaveCallPage } from "@/components/livekit/useLeaveCallPage"

/** A call on its own page (a tab, or a phone). On a computer it usually opens beside the conversation instead. */
export default function Page({ params }: { params: Promise<{ grpId: string }> }) {
  const { grpId } = use(params)
  const leave = useLeaveCallPage()
  return <CallView kind="group" id={grpId} onLeave={leave} />
}
