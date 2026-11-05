"use client"

import dynamic from "next/dynamic"
import { useMemo, type ReactNode } from "react"
import { ThreadParticipants } from "@/components/message/threadParticipants"
import { readHuddleFacts, type HuddleFace } from "@/lib/calls/huddle"
import type { CallKind } from "@/lib/calls/callRef"

// Both load on demand: the card from the post alone, and, while the post says
// its call may be on, the card that reads the call.
const CallCard = dynamic(() => import("@/components/message/callCard"), { ssr: false })
const LiveCallCard = dynamic(() => import("@/components/message/liveCallCard"), { ssr: false })

const faces = (came: HuddleFace[]) => <ThreadParticipants participants={came} maxShown={4} size={22} />

/** A huddle's post (slack-06): its call's card in place of its words. */
export function HuddlePost({ system, at, self, fallback }: { system?: string; at?: { kind: CallKind; id: string }; self?: string; fallback: ReactNode }) {
  const facts = useMemo(() => readHuddleFacts(system), [system])
  if (!facts) return <>{fallback}</>
  const inChannel = at?.kind === "channel"
  return !facts.ended && at ? (
    <LiveCallCard facts={facts} at={at} self={self} inChannel={inChannel} faces={faces} />
  ) : (
    <CallCard facts={facts} inChannel={inChannel} faces={faces} />
  )
}
