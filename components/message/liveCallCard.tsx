"use client"

import CallCard, { type CallCardProps } from "@/components/message/callCard"
import { useLiveCall } from "@/lib/calls/useLiveCall"
import { huddleCallOf } from "@/lib/calls/huddleCall"
import type { CallKind } from "@/lib/calls/callRef"

/**
 * A huddle's card while its post says the call may be on (slack-06): it reads
 * the conversation's call (useLiveCall), for who is in it, how long it has
 * run, and Join. A chunk of its own, loaded only when such a post is drawn, so
 * a conversation's first screen carries none of it.
 */
export default function LiveCallCard({ at, self, ...card }: Omit<CallCardProps, "read" | "href"> & { at: { kind: CallKind; id: string }; self?: string }) {
  const call = huddleCallOf(at, self)
  const read = useLiveCall(call?.ref ?? null)
  return <CallCard {...card} read={read} href={call?.href} />
}
