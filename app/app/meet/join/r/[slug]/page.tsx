"use client"

import { use, useMemo } from "react"
import { MemberDoorView } from "@/components/livekit/MemberDoorView"

/** A personal room's address, for someone in the workspace: in as themselves, with the unlock this tab kept (calls HU13). */
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const door = useMemo(() => ({ slug }), [slug])
  return <MemberDoorView door={door} />
}
